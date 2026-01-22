// sampleSchemas.js
//
// This file defines the built-in schemas shown in the SQL sandbox dropdown.
// We keep it simple: TWO schemas that match your ERD presets:
//   (1) 4-Way Registration (Student–Course–Instructor–BuildingRoom via n-ary takes)
//   (2) Sports League (Teams–Players–Matches + specialization + M:N coaches with attributes)


// 1️⃣ Initial query shown on first load
// (Pick something that works for Schema 1 out of the box.)
window.INITIAL_DEFAULT_QUERY = `
SELECT
  s.Name AS Student,
  c.CourseName AS Course,
  t.Term,
  t.Day_Time,
  b.BuildingName,
  t.RoomNum,
  i.InstrID AS Instructor
FROM takes t
JOIN Student s ON s.SSN = t.SSN
JOIN Course  c ON c.CourseID = t.CourseID
JOIN Instructor i ON i.InstrID = t.InstrID
JOIN Building b ON b.BuildingID = t.BuildingID
ORDER BY t.Term, s.Name, c.CourseName;
`.trim();


// 2️⃣ Built-in schemas + per-schema default queries
window.DEFAULT_SCHEMAS = [
  {
    name: '4-Way Registration (Student–Course–Instructor–Room)',
    script: `
-- Schema 1: 4-Way Registration

CREATE TABLE Student (
  SSN TEXT NOT NULL,
  Name TEXT,
  PRIMARY KEY (SSN)
);

CREATE TABLE Course (
  CourseID TEXT NOT NULL,
  CourseName TEXT,
  PRIMARY KEY (CourseID)
);

CREATE TABLE Instructor (
  InstrID TEXT NOT NULL,
  PRIMARY KEY (InstrID)
);

CREATE TABLE Building (
  BuildingID TEXT NOT NULL,
  BuildingName TEXT,
  PRIMARY KEY (BuildingID)
);

CREATE TABLE BuildingRoom (
  BuildingID TEXT NOT NULL,
  RoomNum TEXT NOT NULL,
  PRIMARY KEY (BuildingID, RoomNum),
  FOREIGN KEY (BuildingID) REFERENCES Building(BuildingID)
);

CREATE TABLE takes (
  SSN TEXT NOT NULL,
  CourseID TEXT NOT NULL,
  InstrID TEXT NOT NULL,
  BuildingID TEXT NOT NULL,
  RoomNum TEXT NOT NULL,
  Term TEXT,
  Day_Time TEXT,
  PRIMARY KEY (SSN, CourseID, InstrID, BuildingID, RoomNum),
  FOREIGN KEY (SSN) REFERENCES Student(SSN),
  FOREIGN KEY (CourseID) REFERENCES Course(CourseID),
  FOREIGN KEY (InstrID) REFERENCES Instructor(InstrID),
  FOREIGN KEY (BuildingID, RoomNum) REFERENCES BuildingRoom(BuildingID, RoomNum)
);

-- ----------------------------
-- Sample data
-- ----------------------------

INSERT INTO Student VALUES ('111-22-3333','Ava Chen');
INSERT INTO Student VALUES ('222-33-4444','Ben Martinez');
INSERT INTO Student VALUES ('333-44-5555','Cara Johnson');
INSERT INTO Student VALUES ('444-55-6666','Dev Patel');
INSERT INTO Student VALUES ('555-66-7777','Ella Nguyen');
INSERT INTO Student VALUES ('666-77-8888','Finn O''Brien');

INSERT INTO Course VALUES ('BA101','Business Analytics I');
INSERT INTO Course VALUES ('DB201','Relational Databases');
INSERT INTO Course VALUES ('OM310','Operations Management');
INSERT INTO Course VALUES ('EC202','Managerial Economics');
INSERT INTO Course VALUES ('MKT250','Marketing Fundamentals');

INSERT INTO Instructor VALUES ('I100');
INSERT INTO Instructor VALUES ('I110');
INSERT INTO Instructor VALUES ('I120');
INSERT INTO Instructor VALUES ('I130');

INSERT INTO Building VALUES ('LIL','Lillis Hall');
INSERT INTO Building VALUES ('CH','Chapman Hall');
INSERT INTO Building VALUES ('WIL','Willamette Hall');

INSERT INTO BuildingRoom VALUES ('LIL','115');
INSERT INTO BuildingRoom VALUES ('LIL','220');
INSERT INTO BuildingRoom VALUES ('CH','101');
INSERT INTO BuildingRoom VALUES ('CH','204');
INSERT INTO BuildingRoom VALUES ('WIL','10');
INSERT INTO BuildingRoom VALUES ('WIL','12');

-- Term: 2026W (Winter), 2026S (Spring)
INSERT INTO takes VALUES ('111-22-3333','DB201','I110','LIL','220','2026W','Mon/Wed 10:00');
INSERT INTO takes VALUES ('111-22-3333','OM310','I120','CH','204','2026W','Tue/Thu 13:00');

INSERT INTO takes VALUES ('222-33-4444','BA101','I100','LIL','115','2026W','Mon/Wed 09:00');
INSERT INTO takes VALUES ('222-33-4444','DB201','I110','LIL','220','2026W','Mon/Wed 10:00');

INSERT INTO takes VALUES ('333-44-5555','EC202','I130','WIL','10','2026W','Tue/Thu 11:00');
INSERT INTO takes VALUES ('333-44-5555','DB201','I110','LIL','220','2026W','Mon/Wed 10:00');

INSERT INTO takes VALUES ('444-55-6666','OM310','I120','CH','204','2026W','Tue/Thu 13:00');
INSERT INTO takes VALUES ('444-55-6666','MKT250','I130','WIL','12','2026W','Mon/Wed 14:00');

INSERT INTO takes VALUES ('555-66-7777','BA101','I100','LIL','115','2026S','Mon/Wed 09:00');
INSERT INTO takes VALUES ('555-66-7777','EC202','I130','WIL','10','2026S','Tue/Thu 11:00');

INSERT INTO takes VALUES ('666-77-8888','DB201','I110','CH','101','2026S','Tue/Thu 15:00');
INSERT INTO takes VALUES ('666-77-8888','MKT250','I130','WIL','12','2026S','Mon/Wed 14:00');
`.trim(),

    defaultQuery: `
-- Interesting query:
-- Find "room utilization" by term (how many distinct meetings are scheduled in each room),
-- and show the top rooms first.
SELECT
  t.Term,
  b.BuildingName,
  t.BuildingID,
  t.RoomNum,
  COUNT(*) AS MeetingsScheduled,
  COUNT(DISTINCT t.CourseID) AS DistinctCourses,
  COUNT(DISTINCT t.SSN) AS DistinctStudents
FROM takes t
JOIN Building b ON b.BuildingID = t.BuildingID
GROUP BY t.Term, t.BuildingID, t.RoomNum
ORDER BY t.Term, MeetingsScheduled DESC, b.BuildingName, t.RoomNum;
    `.trim()
  },

  {
    name: 'Sports League (Teams–Players–Matches + Specialization)',
    script: `
-- Schema 2: Sports League

-- Specialization "is-a": supertype Team, subtypes { ClubTeam, SchoolTeam }, disjoint=true, total=false.

CREATE TABLE Coach (
  CoachID TEXT NOT NULL,
  CoachName TEXT,
  PRIMARY KEY (CoachID)
);

CREATE TABLE Coach_Phone (
  CoachID TEXT NOT NULL,
  Phone TEXT NOT NULL,
  PRIMARY KEY (CoachID, Phone),
  FOREIGN KEY (CoachID) REFERENCES Coach(CoachID)
);

CREATE TABLE Team (
  TeamID TEXT NOT NULL,
  TeamName TEXT,
  PRIMARY KEY (TeamID)
);

CREATE TABLE ClubTeam (
  TeamID TEXT NOT NULL,
  League TEXT,
  PRIMARY KEY (TeamID),
  FOREIGN KEY (TeamID) REFERENCES Team(TeamID)
);

CREATE TABLE School (
  SchoolID TEXT NOT NULL,
  SchoolName TEXT,
  PRIMARY KEY (SchoolID)
);

CREATE TABLE SchoolTeam (
  TeamID TEXT NOT NULL,
  Division TEXT,
  School_SchoolID TEXT,
  PRIMARY KEY (TeamID),
  FOREIGN KEY (TeamID) REFERENCES Team(TeamID),
  FOREIGN KEY (School_SchoolID) REFERENCES School(SchoolID)
);

CREATE TABLE Manager (
  ManagerID TEXT NOT NULL,
  ManagerName TEXT,
  Team_TeamID TEXT NOT NULL UNIQUE,
  PRIMARY KEY (ManagerID),
  FOREIGN KEY (Team_TeamID) REFERENCES Team(TeamID)
);

CREATE TABLE Agent (
  AgentID TEXT NOT NULL,
  AgentName TEXT,
  PRIMARY KEY (AgentID)
);

CREATE TABLE Player (
  TeamID TEXT NOT NULL,
  Number TEXT NOT NULL,
  PlayerName TEXT,
  Agent_AgentID TEXT,
  PRIMARY KEY (TeamID, Number),
  FOREIGN KEY (TeamID) REFERENCES Team(TeamID),
  FOREIGN KEY (Agent_AgentID) REFERENCES Agent(AgentID)
);

CREATE TABLE Field (
  FieldID TEXT NOT NULL,
  Address TEXT,
  ContactPhone TEXT,
  ContactPerson TEXT,
  PRIMARY KEY (FieldID)
);

CREATE TABLE Match (
  HomeTeamID TEXT NOT NULL,
  AwayTeamID TEXT NOT NULL,
  MatchDate TEXT NOT NULL,
  Time TEXT,
  FieldID TEXT,
  PRIMARY KEY (HomeTeamID, AwayTeamID, MatchDate),
  FOREIGN KEY (FieldID) REFERENCES Field(FieldID),
  FOREIGN KEY (HomeTeamID) REFERENCES Team(TeamID),
  FOREIGN KEY (AwayTeamID) REFERENCES Team(TeamID)
);

CREATE TABLE coaches (
  CoachID TEXT NOT NULL,
  TeamID TEXT NOT NULL,
  Role TEXT,
  StartDate TEXT,
  EndDate TEXT,
  PRIMARY KEY (CoachID, TeamID),
  FOREIGN KEY (CoachID) REFERENCES Coach(CoachID),
  FOREIGN KEY (TeamID) REFERENCES Team(TeamID)
);

-- ----------------------------
-- Sample data
-- ----------------------------

INSERT INTO Coach VALUES ('C01','Jordan Lee');
INSERT INTO Coach VALUES ('C02','Sam Rivera');
INSERT INTO Coach VALUES ('C03','Pat Quinn');
INSERT INTO Coach VALUES ('C04','Taylor Brooks');

INSERT INTO Coach_Phone VALUES ('C01','541-555-1001');
INSERT INTO Coach_Phone VALUES ('C01','541-555-1002');
INSERT INTO Coach_Phone VALUES ('C02','541-555-2001');
INSERT INTO Coach_Phone VALUES ('C03','541-555-3001');
INSERT INTO Coach_Phone VALUES ('C04','541-555-4001');

INSERT INTO Team VALUES ('T10','Eugene Eagles');
INSERT INTO Team VALUES ('T11','Springfield Spartans');
INSERT INTO Team VALUES ('T12','Corvallis Cyclones');
INSERT INTO Team VALUES ('T13','Bend Beacons');

INSERT INTO Team VALUES ('T20','Lane United');
INSERT INTO Team VALUES ('T21','Cascade FC');

INSERT INTO ClubTeam VALUES ('T20','Oregon Premier League');
INSERT INTO ClubTeam VALUES ('T21','Oregon Premier League');

INSERT INTO School VALUES ('S01','Eugene High');
INSERT INTO School VALUES ('S02','Springfield High');
INSERT INTO School VALUES ('S03','Corvallis High');
INSERT INTO School VALUES ('S04','Bend High');

INSERT INTO SchoolTeam VALUES ('T10','Varsity','S01');
INSERT INTO SchoolTeam VALUES ('T11','Varsity','S02');
INSERT INTO SchoolTeam VALUES ('T12','JV','S03');
INSERT INTO SchoolTeam VALUES ('T13','Varsity','S04');

INSERT INTO Manager VALUES ('M10','Alex Kim','T10');
INSERT INTO Manager VALUES ('M11','Riley Singh','T11');
INSERT INTO Manager VALUES ('M20','Morgan Davis','T20');

INSERT INTO Agent VALUES ('A01','Northwest Sports Group');
INSERT INTO Agent VALUES ('A02','Summit Athlete Agency');
INSERT INTO Agent VALUES ('A03','Emerald Talent');

-- Players (TeamID, Number is the PK)
INSERT INTO Player VALUES ('T10','7','Maya Lopez','A01');
INSERT INTO Player VALUES ('T10','10','Noah Reed','A02');
INSERT INTO Player VALUES ('T10','23','Zoe Park',NULL);

INSERT INTO Player VALUES ('T11','9','Liam Carter','A03');
INSERT INTO Player VALUES ('T11','11','Sofia Gray',NULL);

INSERT INTO Player VALUES ('T12','4','Ethan Chen','A01');
INSERT INTO Player VALUES ('T12','8','Ava Patel',NULL);

INSERT INTO Player VALUES ('T20','12','Kai Wilson','A02');
INSERT INTO Player VALUES ('T20','18','Emma Brooks',NULL);

INSERT INTO Player VALUES ('T21','6','Olivia Stone','A03');
INSERT INTO Player VALUES ('T21','14','Henry Young',NULL);

INSERT INTO Field VALUES ('F1','1500 Willamette St, Eugene, OR','541-555-9001','Casey Morgan');
INSERT INTO Field VALUES ('F2','2100 Main St, Springfield, OR','541-555-9002','Jamie Reed');
INSERT INTO Field VALUES ('F3','500 NW Campus Way, Corvallis, OR','541-555-9003','Taylor Nguyen');

-- Coaches assigned to teams (M:N + attributes)
INSERT INTO coaches VALUES ('C01','T10','Head Coach','2024-08-15',NULL);
INSERT INTO coaches VALUES ('C02','T10','Assistant Coach','2025-03-01',NULL);
INSERT INTO coaches VALUES ('C02','T11','Head Coach','2023-08-20',NULL);
INSERT INTO coaches VALUES ('C03','T12','Head Coach','2025-08-10',NULL);
INSERT INTO coaches VALUES ('C04','T20','Head Coach','2022-06-01',NULL);
INSERT INTO coaches VALUES ('C01','T21','Assistant Coach','2025-01-10',NULL);

-- Matches (weak entity identified by home/away + date)
INSERT INTO Match VALUES ('T10','T11','2026-09-05','18:00','F1');
INSERT INTO Match VALUES ('T11','T10','2026-10-01','18:30','F2');
INSERT INTO Match VALUES ('T10','T12','2026-09-12','12:00','F1');
INSERT INTO Match VALUES ('T13','T10','2026-09-19','13:00','F3');
INSERT INTO Match VALUES ('T20','T21','2026-09-07','19:00','F2');
INSERT INTO Match VALUES ('T21','T20','2026-10-03','16:00','F1');
`.trim(),

    defaultQuery: `
-- Interesting query:
-- List matches with human-readable team names + field,
-- and show each team's head coach (if any) alongside.
SELECT
  m.MatchDate,
  m.Time,
  ht.TeamName AS HomeTeam,
  at.TeamName AS AwayTeam,
  f.Address AS FieldAddress,
  hc.CoachName AS HomeHeadCoach,
  ac.CoachName AS AwayHeadCoach
FROM Match m
JOIN Team ht ON ht.TeamID = m.HomeTeamID
JOIN Team at ON at.TeamID = m.AwayTeamID
LEFT JOIN Field f ON f.FieldID = m.FieldID
LEFT JOIN coaches hcx ON hcx.TeamID = m.HomeTeamID AND hcx.Role = 'Head Coach' AND hcx.EndDate IS NULL
LEFT JOIN Coach  hc  ON hc.CoachID = hcx.CoachID
LEFT JOIN coaches acx ON acx.TeamID = m.AwayTeamID AND acx.Role = 'Head Coach' AND acx.EndDate IS NULL
LEFT JOIN Coach  ac  ON ac.CoachID = acx.CoachID
ORDER BY m.MatchDate, m.Time, HomeTeam;
    `.trim()
  }
];