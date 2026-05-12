# Build conversion factors for GrowthLens.
#
# Reads year-by-year DESE statewide assessment summaries from inputs/, extracts
# grade x subject means and SDs, then produces a JSON file of annual-growth
# effect sizes via a synthetic-cohort design: grade g in year t is paired with
# grade g-1 in year t-1, and the change in means is divided by the prior-year
# SD.
#
# Expected inputs/ layout: one .xls or .xlsx file per school year (year denoted
# by spring administration). Each workbook has a single sheet whose header row
# starts with "YEAR" and whose columns are:
#   year | content_area | grade | n | sd | mean | min | max
# Some years (e.g., 2021, 2022) prepend a "Results this year..." preamble row
# above the header; this script locates the YEAR header dynamically rather
# than assuming a fixed offset.
#
# Run from the data-prep/ directory:
#   Rscript scripts/01_build_conversion_factors.R

# ---- Parameters --------------------------------------------------------------

factors_date = format(Sys.Date(), "%Y%m%d")
base_weeks = 38
inputs_dir = "inputs"
output_path = paste0("outputs/", factors_date, "_conversion_factors.json")

# ---- Setup -------------------------------------------------------------------

suppressPackageStartupMessages({
  library(tidyverse)
  library(readxl)
  library(jsonlite)
})

# ---- Locate input files ------------------------------------------------------

if (!dir.exists(inputs_dir)) {
  stop(sprintf("Inputs directory not found: '%s'", inputs_dir))
}

input_files = list.files(inputs_dir, pattern = "[.]xlsx?$", full.names = TRUE)
if (length(input_files) == 0) {
  stop(sprintf(
    "No .xls or .xlsx files found in '%s'. Place DESE statewide-assessment workbooks there before running.",
    inputs_dir
  ))
}

cat(sprintf("Found %d input file(s):\n", length(input_files)))
for (f in input_files) cat("  ", basename(f), "\n", sep = "")

# ---- Read each file ----------------------------------------------------------

# Each workbook has one sheet. The YEAR header row may be row 1 or row 2
# depending on whether a preamble note was included; locate it dynamically.

read_one = function(path) {
  raw = suppressMessages(read_excel(path, sheet = 1, col_names = FALSE))
  header_row = which(raw[[1]] == "YEAR")
  if (length(header_row) != 1) {
    stop(sprintf(
      "Could not locate a unique 'YEAR' header row in %s",
      basename(path)
    ))
  }
  body = raw[(header_row + 1):nrow(raw), 1:6]
  names(body) = c("year", "content", "grade", "n", "sd", "mean")
  body
}

raw = input_files |>
  map(read_one) |>
  list_rbind()

# ---- Coerce, map subjects, filter to MAP grades 3-8 --------------------------

raw = raw |>
  mutate(
    year = suppressWarnings(as.integer(year)),
    grade = suppressWarnings(as.integer(grade)),
    mean = suppressWarnings(as.numeric(mean)),
    sd = suppressWarnings(as.numeric(sd)),
    subject = case_when(
      content == "Communication Arts" ~ "ela",
      content == "Mathematics" ~ "math",
      TRUE ~ NA_character_
    )
  ) |>
  filter(!is.na(grade), grade %in% 3:8, !is.na(subject)) |>
  select(year, grade, subject, mean, sd)

# ---- Validate ----------------------------------------------------------------

if (any(is.na(raw$year))) stop("'year' coerced to NA for some rows after parsing")
if (any(is.na(raw$mean))) stop("'mean' contains NA values after parsing")
if (any(is.na(raw$sd))) stop("'sd' contains NA values after parsing")

dup = raw |>
  count(year, grade, subject) |>
  filter(n > 1)
if (nrow(dup) > 0) {
  stop(sprintf(
    "Duplicate rows for (year, grade, subject): %s",
    paste0(dup$year, "-G", dup$grade, "-", dup$subject, collapse = "; ")
  ))
}

cat(sprintf(
  "\nLoaded %d year x grade x subject cells across %d file(s).\n",
  nrow(raw), length(input_files)
))

# ---- Build synthetic-cohort factors ------------------------------------------

lookup = raw |>
  select(year, grade, subject, mean, sd)

prior = lookup |>
  rename(
    year_prior = year, grade_prior = grade,
    mean_prior = mean, sd_prior = sd
  )

with_prior = lookup |>
  mutate(year_prior = year - 1L, grade_prior = grade - 1L) |>
  left_join(prior, by = c("year_prior", "grade_prior", "subject"))

years_in_data = sort(unique(lookup$year))

skipped = with_prior |>
  filter(is.na(mean_prior) | is.na(sd_prior)) |>
  mutate(reason = case_when(
    grade_prior < 3 ~
      "no grade-2 baseline available (grade 3 cohort)",
    !(year_prior %in% years_in_data) ~
      sprintf("prior year %d not in input", year_prior),
    TRUE ~
      sprintf("no row for year=%d, grade=%d, subject=%s",
              year_prior, grade_prior, subject)
  )) |>
  select(year, grade, subject, reason)

computed = with_prior |>
  filter(!is.na(mean_prior), !is.na(sd_prior)) |>
  mutate(
    annual_growth_raw = round(mean - mean_prior, 2),
    baseline_sd = round(sd_prior, 2),
    annual_growth_effect_size = round((mean - mean_prior) / sd_prior, 4)
  ) |>
  select(year, grade, subject,
         annual_growth_raw, baseline_sd, annual_growth_effect_size)

# ---- Write JSON --------------------------------------------------------------

if (!dir.exists("outputs")) dir.create("outputs", recursive = TRUE)

out = list(
  version = format(Sys.Date(), "%Y-%m-%d"),
  source = "Missouri MAP Grade-Level Assessment, synthetic cohort growth",
  formula = "weeks_of_learning = base_weeks * (1 + z_residual / annual_growth_effect_size)",
  base_weeks = base_weeks,
  factors = computed
)

json_text = toJSON(out, na = "null", auto_unbox = TRUE, pretty = TRUE)
writeLines(json_text, output_path)

# ---- Validation summary ------------------------------------------------------

file_size_kb = round(file.info(output_path)$size / 1024, 1)
cat(sprintf("\nWrote %s (%.1f KB)\n", output_path, file_size_kb))
cat(sprintf("Factor rows written: %d\n", nrow(computed)))

if (nrow(computed) > 0) {
  cat(sprintf(
    "Coverage: years %s; grades %s; subjects %s\n",
    paste(sort(unique(computed$year)), collapse = ", "),
    paste(sort(unique(computed$grade)), collapse = ", "),
    paste(sort(unique(computed$subject)), collapse = ", ")
  ))
}

if (nrow(skipped) > 0) {
  cat(sprintf("\nSkipped cells (%d):\n", nrow(skipped)))
  for (i in seq_len(nrow(skipped))) {
    r = skipped[i, ]
    cat(sprintf("  year=%d grade=%d subject=%s -- %s\n",
                r$year, r$grade, r$subject, r$reason))
  }
} else {
  cat("\nNo skipped cells.\n")
}

if (nrow(computed) > 0) {
  pick = computed[sample(nrow(computed), 1), ]
  cat("\nRandom spot-check factor:\n")
  print(pick)
}
