-- GrowthLens Supabase schema — the complete one-pass console script.
-- Paste this whole file into the Supabase SQL Editor and run it ONCE on a
-- fresh project. It creates:
--   1. events              usage telemetry (anon may ONLY insert)
--   2. resources           evidence-resource workbench (public read, admin write)
--   3. resource_crosswalk  finding→resource matching rules (same policies)
-- and seeds the two resource tables from reference/evidence_resources.csv and
-- reference/evidence_crosswalk.csv as of 2026-07-20 (seeds generated
-- mechanically via engine/resources.js parseCsv — see the plan's Task 10).
--
-- The app itself never reads these tables: resources are SERVED from the
-- static CSVs in reference/. tools/publish-resources.js regenerates those
-- CSVs from these tables (GitHub workflow: publish-resources).

-- ---- 1. usage telemetry -----------------------------------------------------

create table public.events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  district_id text not null check (char_length(district_id) between 1 and 120),
  is_custom boolean not null default false,
  device_id uuid,
  session_id uuid,
  event text not null check (char_length(event) <= 40),
  props jsonb not null default '{}'::jsonb check (pg_column_size(props) <= 2048),
  app_version text check (char_length(app_version) <= 20)
);

alter table public.events enable row level security;

-- The public anon key may ONLY insert. No select/update/delete policies exist
-- for anon, so RLS denies them regardless of default grants.
create policy events_insert_anon on public.events
  for insert to anon with check (true);

-- The admin dashboard (next project) reads as an authenticated user.
create policy events_select_admin on public.events
  for select to authenticated using (true);

create index events_created_at_idx on public.events (created_at);

-- ---- 2. resources workbench -------------------------------------------------
-- Columns mirror the CSV headers exactly; position preserves file order so
-- published CSVs are stable; updated_at is informational (set on insert; the
-- admin panel maintains it on update).

create table public.resources (
  resource_id text primary key check (char_length(resource_id) <= 10),
  title text not null,
  series text not null default '',
  evidence_type text not null default '',
  subject text not null default '',
  grade_band text not null default '',
  population text not null default '',
  url text not null,
  notes text not null default '',
  position integer not null unique,
  updated_at timestamptz not null default now()
);

create table public.resource_crosswalk (
  id bigint generated always as identity primary key,
  finding_type text not null,
  subgroup text not null,
  subject text not null,
  grade_band text not null,
  resource_id text not null references public.resources(resource_id) on delete cascade,
  match_strength text not null,
  rationale text not null default '',
  position integer not null unique,
  updated_at timestamptz not null default now()
);

alter table public.resources enable row level security;
alter table public.resource_crosswalk enable row level security;

-- Public read: this content ships in the open repo and in every app visit;
-- anon SELECT also lets the publish workflow use the anon key.
create policy resources_select_public on public.resources
  for select to anon, authenticated using (true);
create policy crosswalk_select_public on public.resource_crosswalk
  for select to anon, authenticated using (true);

-- Admin write (the invited OTP user — signups are disabled).
create policy resources_write_admin on public.resources
  for all to authenticated using (true) with check (true);
create policy crosswalk_write_admin on public.resource_crosswalk
  for all to authenticated using (true) with check (true);

-- ---- 3. seeds ---------------------------------------------------------------

insert into public.resources
  (resource_id, title, series, evidence_type, subject, grade_band, population, url, notes, position)
values
  ('R01', 'Supports for Multilingual Students who are Classified as English Learners (updated Sept 2024)', 'edresearch_overview', 'synthesis', 'any', 'all', 'mll', 'https://edresearchforaction.org/research-briefs/supports-for-multilingual-students-who-are-classified-as-english-learners/', 'Primary synthesis for MLL/EL population; supersedes 2021 EL brief', 1),
  ('R02', 'Promoting School Success for Immigrant-Origin Students', 'edresearch_overview', 'synthesis', 'any', 'all', 'immigrant', 'https://edresearchforaction.org/research-briefs/promoting-school-success-for-immigrant-origin-students/', 'Overlaps MLL population; supersedes 2021 immigrant-families brief', 2),
  ('R03', 'Academic Supports for Students with Disabilities', 'edresearch_overview', 'synthesis', 'any', 'all', 'swd', 'https://edresearchforaction.org/research-briefs/academic-supports-for-students-with-disabilities/', 'Primary synthesis for SWD population', 3),
  ('R04', 'Addressing Special Education Staffing Shortages: Strategies for Schools', 'edresearch_overview', 'synthesis', 'any', 'all', 'swd', 'https://edresearchforaction.org/research-briefs/addressing-special-education-staffing-shortages-strategies-for-schools/', 'District capacity lens; staffing not instruction', 4),
  ('R05', 'Educational Practices to Identify and Support Students Experiencing Homelessness', 'edresearch_overview', 'synthesis', 'any', 'all', 'homeless', 'https://edresearchforaction.org/research-briefs/identifying-and-supporting-students-experiencing-homelessness/', 'Only relevant if district data include McKinney-Vento flag', 5),
  ('R06', 'Design Principles for Accelerating Student Learning with High-Impact Tutoring (updated June 2024)', 'edresearch_design', 'synthesis', 'any', 'all', 'general', 'https://edresearchforaction.org/research-briefs/design-principles-for-accelerating-student-learning-with-high-impact-tutoring/', 'Strongest general acceleration evidence; supersedes original tutoring brief', 6),
  ('R07', 'Design Principles for Academic Summer Learning Programs', 'edresearch_design', 'synthesis', 'any', 'all', 'general', 'https://edresearchforaction.org/research-briefs/advancing-student-learning-and-opportunity-through-voluntary-academic-summer-learning-programs/', '', 7),
  ('R08', 'Accelerating Student Academic Recovery', 'edresearch_overview', 'synthesis', 'any', 'all', 'general', 'https://edresearchforaction.org/research-briefs/accelerating-student-academic-recovery/', 'Supersedes 2020 learning-loss brief', 8),
  ('R09', 'Reducing Student Absenteeism', 'edresearch_overview', 'synthesis', 'any', 'all', 'general', 'https://edresearchforaction.org/research-briefs/reducing-student-absenteeism/', 'Surface only where attendance is a plausible channel (e.g. mobility/homelessness)', 9),
  ('R10', 'Tier 1 Instructional Strategies to Improve K-4 Reading Comprehension', 'edresearch_overview', 'synthesis', 'ela', 'elementary', 'general', 'https://edresearchforaction.org/research-briefs/tier-1-instructional-strategies-to-improve-k-4-reading-comprehension/', 'Only elementary-ELA instructional synthesis in corpus', 10),
  ('R11', 'Evidence-Based Practices for Teaching Writing in Middle and High School', 'edresearch_overview', 'synthesis', 'ela', 'secondary', 'general', 'https://edresearchforaction.org/research-briefs/evidence-based-practices-for-teaching-writing-in-middle-and-high-school/', 'Construct caution: writing instruction vs. reading-weighted state ELA assessments', 11),
  ('R12', 'Evidence-Based Practices for Algebra 1 Access, Placement, and Success', 'edresearch_overview', 'synthesis', 'math', 'secondary', 'general', 'https://edresearchforaction.org/research-briefs/evidence-based-practices-for-algebra-1-access-placement-and-success/', 'Access/placement policy focus, not general math instruction', 12),
  ('R13', 'District Systems to Support Equitable and High-Quality Teaching and Learning', 'edresearch_overview', 'synthesis', 'any', 'all', 'equity_general', 'https://edresearchforaction.org/research-briefs/district-systems-to-support-equitable-and-high-quality-teaching-and-learning/', 'Systems-level; closest synthesis match for FRL and race/ethnicity gaps', 13),
  ('R14', 'Design Principles for Improving Practice with Instructional Coaching', 'edresearch_design', 'synthesis', 'any', 'all', 'general', 'https://edresearchforaction.org/research-briefs/design-principles-for-improving-practice-with-instructional-coaching/', 'Instructional capacity channel', 14),
  ('R15', 'Algebra I Policy Self-Assessment: Aligning to the Evidence (Tool)', 'hub_tool', 'practitioner_tool', 'math', 'secondary', 'general', 'https://edresearchforaction.org/wp-content/uploads/Algebra-1-Aligning-to-the-Evidence-Tool.pdf', 'Companion to R12; PDF self-assessment', 15),
  ('R16', 'Algebra I Placement and Access: A Facilitation Guide for District Leadership Teams', 'hub_tool', 'practitioner_tool', 'math', 'secondary', 'general', 'https://docs.google.com/presentation/d/1CFyGpBEIkliZcokjyqqhnRs_hBR0QRCZtsXEStIqgHI/edit?usp=sharing', 'Companion to R12; Google Slides link - hosting stability risk', 16),
  ('R17', 'Closing the Gaps: Early Impacts of Dallas ISD''s Opt-out Policy on Advanced Course Enrollment (EdWP 25-1184)', 'edworkingpaper', 'single_study', 'math', 'secondary', 'frl_race', 'https://edworkingpapers.com/ai25-1184', 'Single quasi-experimental study; advanced-course enrollment outcome, not growth', 17),
  ('R18', 'Improving College Readiness in Mathematics in the Context of a Comprehensive High School Reform (EdWP 25-1131)', 'edworkingpaper', 'single_study', 'math', 'high', 'general', 'https://edworkingpapers.com/ai25-1131', 'Single study; HS reform context', 18),
  ('R19', 'Socioeconomic and Racial Discrepancies in Algebra Access, Teacher, and Learning Experiences (EdWP 24-1084)', 'edworkingpaper', 'single_study', 'math', 'secondary', 'frl_race', 'https://edworkingpapers.com/ai25-1084', 'Descriptive national survey evidence; documents disparities, does not test interventions', 19),
  ('R20', 'Accelerating Opportunity: The Effects of Instructionally Supported Detracking (EdWP 24-986)', 'edworkingpaper', 'single_study', 'math', 'secondary', 'general', 'https://edworkingpapers.com/ai24-986', 'Single quasi-experimental study', 20),
  ('R21', 'Measuring Belonging, Rigor, Discourse, and CRSE in Math Instruction (EdInstruments Collection)', 'edinstruments', 'measurement', 'math', 'all', 'general', 'https://edinstruments.org/collections/math-instruction-collection', 'Student-perspective instruments for follow-up data collection', 21),
  ('R22', 'Assessing ELA and Math Curriculum Shifts: A Practical Guide for Measurement and Progress Monitoring (EdInstruments Toolkit)', 'edinstruments', 'measurement', 'any', 'all', 'general', 'https://edinstruments.org/toolkits/assessing-ela-and-math-curriculum-shifts-practical-guide-measurement-and-progress', 'Implementation progress-monitoring toolkit', 22);

insert into public.resource_crosswalk
  (finding_type, subgroup, subject, grade_band, resource_id, match_strength, rationale, position)
values
  ('subgroup_gap', 'mll', 'any', 'any', 'R01', 'direct', 'Research synthesis on supports for students classified as English learners', 1),
  ('subgroup_gap', 'mll', 'any', 'any', 'R02', 'adjacent', 'Related synthesis on immigrant-origin students; populations overlap but are not identical', 2),
  ('subgroup_gap', 'mll', 'any', 'any', 'R06', 'general', 'Broad evidence on accelerating learning; not specific to this finding', 3),
  ('subgroup_gap', 'mll', 'any', 'any', 'R08', 'general', 'Broad evidence on accelerating learning; not specific to this finding', 4),
  ('subgroup_gap', 'swd', 'any', 'any', 'R03', 'direct', 'Research synthesis on academic supports for students with disabilities', 5),
  ('subgroup_gap', 'swd', 'any', 'any', 'R04', 'adjacent', 'District staffing-capacity evidence; relevant if special education staffing is a constraint', 6),
  ('subgroup_gap', 'swd', 'any', 'any', 'R06', 'general', 'Broad evidence on accelerating learning; not specific to this finding', 7),
  ('subgroup_gap', 'swd', 'any', 'any', 'R08', 'general', 'Broad evidence on accelerating learning; not specific to this finding', 8),
  ('subgroup_gap', 'frl', 'math', 'middle', 'R19', 'adjacent', 'Descriptive national evidence on SES disparities in algebra access and learning experiences; documents patterns, does not evaluate interventions', 9),
  ('subgroup_gap', 'frl', 'math', 'high', 'R19', 'adjacent', 'Descriptive national evidence on SES disparities in algebra access and learning experiences; documents patterns, does not evaluate interventions', 10),
  ('subgroup_gap', 'frl', 'math', 'middle', 'R17', 'adjacent', 'Single study of an opt-out advanced-placement policy; outcome is course enrollment, not achievement growth', 11),
  ('subgroup_gap', 'frl', 'math', 'high', 'R17', 'adjacent', 'Single study of an opt-out advanced-placement policy; outcome is course enrollment, not achievement growth', 12),
  ('subgroup_gap', 'frl', 'any', 'any', 'R13', 'adjacent', 'Systems-level synthesis on equitable access to high-quality instruction; closest available synthesis for income gaps', 13),
  ('subgroup_gap', 'frl', 'any', 'any', 'R06', 'general', 'Broad evidence on accelerating learning; not specific to this finding', 14),
  ('subgroup_gap', 'frl', 'any', 'any', 'R07', 'general', 'Broad evidence on accelerating learning; not specific to this finding', 15),
  ('subgroup_gap', 'frl', 'any', 'any', 'R08', 'general', 'Broad evidence on accelerating learning; not specific to this finding', 16),
  ('subgroup_gap', 'race', 'math', 'middle', 'R19', 'adjacent', 'Descriptive national evidence on racial disparities in algebra access and learning experiences', 17),
  ('subgroup_gap', 'race', 'math', 'high', 'R19', 'adjacent', 'Descriptive national evidence on racial disparities in algebra access and learning experiences', 18),
  ('subgroup_gap', 'race', 'math', 'middle', 'R17', 'adjacent', 'Single study of an opt-out policy aimed at racial gaps in advanced course enrollment', 19),
  ('subgroup_gap', 'race', 'math', 'high', 'R17', 'adjacent', 'Single study of an opt-out policy aimed at racial gaps in advanced course enrollment', 20),
  ('subgroup_gap', 'race', 'math', 'middle', 'R20', 'adjacent', 'Single study of instructionally supported detracking', 21),
  ('subgroup_gap', 'race', 'math', 'high', 'R20', 'adjacent', 'Single study of instructionally supported detracking', 22),
  ('subgroup_gap', 'race', 'any', 'any', 'R13', 'adjacent', 'Systems-level synthesis on equitable access to high-quality instruction', 23),
  ('subgroup_gap', 'race', 'any', 'any', 'R06', 'general', 'Broad evidence on accelerating learning; not specific to this finding', 24),
  ('subgroup_gap', 'race', 'any', 'any', 'R07', 'general', 'Broad evidence on accelerating learning; not specific to this finding', 25),
  ('subgroup_gap', 'race', 'any', 'any', 'R08', 'general', 'Broad evidence on accelerating learning; not specific to this finding', 26),
  ('subgroup_gap', 'homeless', 'any', 'any', 'R05', 'direct', 'Research synthesis on identifying and supporting students experiencing homelessness', 27),
  ('subgroup_gap', 'homeless', 'any', 'any', 'R09', 'adjacent', 'Attendance is a common mediating channel for highly mobile students', 28),
  ('subgroup_gap', 'homeless', 'any', 'any', 'R06', 'general', 'Broad evidence on accelerating learning; not specific to this finding', 29),
  ('subgroup_gap', 'homeless', 'any', 'any', 'R08', 'general', 'Broad evidence on accelerating learning; not specific to this finding', 30),
  ('low_growth', '', 'math', 'elementary', 'R06', 'general', 'Broad evidence on accelerating learning; not specific to this finding', 31),
  ('low_growth', '', 'math', 'elementary', 'R07', 'general', 'Broad evidence on accelerating learning; not specific to this finding', 32),
  ('low_growth', '', 'math', 'elementary', 'R08', 'general', 'Broad evidence on accelerating learning; not specific to this finding', 33),
  ('low_growth', '', 'math', 'elementary', 'R14', 'adjacent', 'Instructional-capacity channel; not math-specific', 34),
  ('low_growth', '', 'math', 'elementary', 'R22', 'adjacent', 'Toolkit for monitoring math curriculum implementation', 35),
  ('low_growth', '', 'math', 'middle', 'R12', 'direct', 'Synthesis on Algebra I access, placement, and success; placement decisions concentrate in middle grades. Note: addresses access and placement policy, not general instructional quality', 36),
  ('low_growth', '', 'math', 'middle', 'R15', 'adjacent', 'Self-assessment tool for aligning placement policy to evidence; companion to the Algebra I brief', 37),
  ('low_growth', '', 'math', 'middle', 'R16', 'adjacent', 'Facilitation guide for district leadership teams; companion to the Algebra I brief', 38),
  ('low_growth', '', 'math', 'middle', 'R20', 'adjacent', 'Single study of instructionally supported detracking', 39),
  ('low_growth', '', 'math', 'middle', 'R21', 'adjacent', 'Instruments for measuring math instructional experience from the student perspective', 40),
  ('low_growth', '', 'math', 'middle', 'R06', 'general', 'Broad evidence on accelerating learning; not specific to this finding', 41),
  ('low_growth', '', 'math', 'middle', 'R08', 'general', 'Broad evidence on accelerating learning; not specific to this finding', 42),
  ('low_growth', '', 'math', 'high', 'R12', 'direct', 'Synthesis on Algebra I access, placement, and success. Note: addresses access and placement policy, not general instructional quality', 43),
  ('low_growth', '', 'math', 'high', 'R15', 'adjacent', 'Self-assessment tool for aligning placement policy to evidence', 44),
  ('low_growth', '', 'math', 'high', 'R16', 'adjacent', 'Facilitation guide for district leadership teams', 45),
  ('low_growth', '', 'math', 'high', 'R18', 'adjacent', 'Single study of math college-readiness gains within a comprehensive high school reform', 46),
  ('low_growth', '', 'math', 'high', 'R20', 'adjacent', 'Single study of instructionally supported detracking', 47),
  ('low_growth', '', 'math', 'high', 'R21', 'adjacent', 'Instruments for measuring math instructional experience from the student perspective', 48),
  ('low_growth', '', 'math', 'high', 'R06', 'general', 'Broad evidence on accelerating learning; not specific to this finding', 49),
  ('low_growth', '', 'math', 'high', 'R08', 'general', 'Broad evidence on accelerating learning; not specific to this finding', 50),
  ('low_growth', '', 'ela', 'elementary', 'R10', 'direct', 'Synthesis on Tier 1 instructional strategies for K-4 reading comprehension', 51),
  ('low_growth', '', 'ela', 'elementary', 'R14', 'adjacent', 'Instructional-capacity channel; not ELA-specific', 52),
  ('low_growth', '', 'ela', 'elementary', 'R06', 'general', 'Broad evidence on accelerating learning; not specific to this finding', 53),
  ('low_growth', '', 'ela', 'elementary', 'R07', 'general', 'Broad evidence on accelerating learning; not specific to this finding', 54),
  ('low_growth', '', 'ela', 'elementary', 'R08', 'general', 'Broad evidence on accelerating learning; not specific to this finding', 55),
  ('low_growth', '', 'ela', 'middle', 'R11', 'adjacent', 'Synthesis on writing instruction; state ELA growth measures are typically reading-weighted, so construct match is partial', 56),
  ('low_growth', '', 'ela', 'high', 'R11', 'adjacent', 'Synthesis on writing instruction; state ELA growth measures are typically reading-weighted, so construct match is partial', 57),
  ('low_growth', '', 'ela', 'middle', 'R22', 'adjacent', 'Toolkit for monitoring ELA curriculum implementation', 58),
  ('low_growth', '', 'ela', 'high', 'R22', 'adjacent', 'Toolkit for monitoring ELA curriculum implementation', 59),
  ('low_growth', '', 'ela', 'middle', 'R06', 'general', 'Broad evidence on accelerating learning; not specific to this finding', 60),
  ('low_growth', '', 'ela', 'middle', 'R08', 'general', 'Broad evidence on accelerating learning; not specific to this finding', 61),
  ('low_growth', '', 'ela', 'high', 'R06', 'general', 'Broad evidence on accelerating learning; not specific to this finding', 62),
  ('low_growth', '', 'ela', 'high', 'R08', 'general', 'Broad evidence on accelerating learning; not specific to this finding', 63);
