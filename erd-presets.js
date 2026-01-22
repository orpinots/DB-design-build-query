/* erd-presets.js
   Option B (no modules): define presets on window so erd.js can use them
   Works from local file system (file://) as long as this file is loaded
   BEFORE erd.js in your HTML.
*/

// All sample ERDs live here
window.ERD_PRESETS = {
    // Sports League ERD (weak entities + identifying rels + home/away roles)
	sportsLeague: {
	  label: "Sports League (Teams–Players–Matches)",
	  data: {
	    entities: [
	      {
	        id: "coach",
	        name: "Coach",
	        x: 120,
	        y: 360,
	        attributes: [
	          { name: "CoachID", pk: true },
	          { name: "CoachName", pk: false },
	          { name: "Phone", pk: false, multi: true, type: "TEXT" }
	        ]
	      },
	      {
	        id: "team",
	        name: "Team",
	        x: 520,
	        y: 260,
	        attributes: [
	          { name: "TeamID", pk: true },
	          { name: "TeamName", pk: false }
	        ]
	      },

	      // Specialization subtypes
	      {
	        id: "clubTeam",
	        name: "ClubTeam",
	        x: 360,
	        y: 120,
	        attributes: [
	          { name: "TeamID", pk: true, fk: true },
	          { name: "League", pk: false }
	        ]
	      },
	      {
	        id: "schoolTeam",
	        name: "SchoolTeam",
	        x: 680,
	        y: 120,
	        attributes: [
	          { name: "TeamID", pk: true, fk: true },
	          { name: "Division", pk: false }
	        ]
	      },
	      {
	        id: "school",
	        name: "School",
	        x: 900,
	        y: 120,
	        attributes: [
	          { name: "SchoolID", pk: true },
	          { name: "SchoolName", pk: false }
	        ]
	      },

	      {
	        id: "manager",
	        name: "Manager",
	        x: 900,
	        y: 260,
	        attributes: [
	          { name: "ManagerID", pk: true },
	          { name: "ManagerName", pk: false }
	        ]
	      },

	      // Weak entity: Player
	      {
	        id: "player",
	        name: "Player",
	        x: 260,
	        y: 260,
	        isWeak: true,
	        attributes: [
	          { name: "TeamID", pk: true, fk: true },
	          { name: "Number", pk: true },
	          { name: "PlayerName", pk: false }
	        ]
	      },

	      {
	        id: "agent",
	        name: "Agent",
	        x: 120,
	        y: 120,
	        attributes: [
	          { name: "AgentID", pk: true },
	          { name: "AgentName", pk: false }
	        ]
	      },

	      {
	        id: "field",
	        name: "Field",
	        x: 900,
	        y: 460,
	        attributes: [
	          { name: "FieldID", pk: true },
	          { name: "Address", pk: false },
	          { name: "ContactPhone", pk: false },
	          { name: "ContactPerson", pk: false }
	        ]
	      },

	      // Weak entity: Match
	      {
	        id: "match",
	        name: "Match",
	        x: 520,
	        y: 420,
	        isWeak: true,
	        attributes: [
	          { name: "HomeTeamID", pk: true, fk: true },
	          { name: "AwayTeamID", pk: true, fk: true },
	          { name: "MatchDate", pk: true },
	          { name: "Time", pk: false },
	          { name: "FieldID", pk: false, fk: true }
	        ]
	      }
	    ],

	    relationships: [
	      {
	        id: "rCoaches",
	        name: "coaches",
	        type: "N:N",
	        a: "coach",
	        b: "team",
	        optA: true,
	        optB: true,
	        // NEW: relationship attributes (will become columns on the junction table)
	        attributes: [
	          { name: "Role",      type: "TEXT", notNull: false }, // e.g., Head / Assistant
	          { name: "StartDate", type: "TEXT", notNull: false }, // or DATE if you support it
			  { name: "EndDate",   type: "TEXT", notNull: false }  // nullable if current
	        ]
	      },
	      {
	        id: "rTeamSpec",
	        name: "is-a",
	        type: "1:1",
	        a: "team",
	        b: "clubTeam",
	        optA: false,
	        optB: false,
	        specializationExtras: ["schoolTeam"],
	        specializationDisjoint: true,
	        specializationTotal: false
	      },
	      {
	        id: "rSchoolHasTeams",
	        name: "has",
	        type: "1:N",
	        a: "school",
	        b: "schoolTeam",
	        optA: false,
	        optB: true
	      },
	      {
	        id: "rHasManager",
	        name: "has",
	        type: "1:1",
	        a: "team",
	        b: "manager",
	        optA: false,
	        optB: true
	      },
	      {
	        id: "rHasPlayer",
	        name: "has",
	        type: "1:N",
	        a: "team",
	        b: "player",
	        optA: false,
	        optB: false,
	        identifying: true,
	        parentSide: "a"
	      },
	      {
	        id: "rHasAgent",
	        name: "has",
	        type: "1:N",
	        a: "agent",
	        b: "player",
	        optA: false,
	        optB: true
	      },
	      {
	        id: "rAtField",
	        name: "at",
	        type: "1:N",
	        a: "field",
	        b: "match",
	        optA: false,
	        optB: true
	      },
	      {
	        id: "rHome",
	        name: "home",
	        type: "1:N",
	        a: "team",
	        b: "match",
	        optA: false,
	        optB: false,
	        identifying: true,
	        parentSide: "a"
	      },
	      {
	        id: "rAway",
	        name: "away",
	        type: "1:N",
	        a: "team",
	        b: "match",
	        optA: false,
	        optB: false,
	        identifying: true,
	        parentSide: "a"
	      }
	    ]
	  }
	},
  fourWay: {
    label: "4-Way Registration (default)",
    data: {
      entities: [
        {
          id: "student",
          name: "Student",
          x: 80,
          y: 260,
          attributes: [
            { name: "SSN",  pk: true },
            { name: "Name", pk: false }
          ]
        },
        {
          id: "course",
          name: "Course",
          x: 420,
          y: 360,
          attributes: [
            { name: "CourseID",  pk: true },
            { name: "CourseName", pk: false }
          ]
        },
        {
          id: "instructor",
          name: "Instructor",
          x: 420,
          y: 120,
          attributes: [
            { name: "InstrID", pk: true }
          ]
        },
        {
          id: "building",
          name: "Building",
          x: 860,
          y: 220,
          attributes: [
              { name: "BuildingID", pk: true },
              { name: "BuildingName", pk: false }
          ]
        },
        {
          id: "buildingRoom",
          name: "BuildingRoom",
          x: 700,
          y: 320,
          isWeak: true,
          attributes: [
            { name: "BuildingID", pk: true, fk: true },
            { name: "RoomNum",   pk: true }
          ]
        }
      ],

      relationships: [
        // Identifying 1:N between Building and BuildingRoom
        {
          id: "rRooms",
          name: "has",
          type: "1:N",
          a: "building",
          b: "buildingRoom",
          optA: false,
          optB: false,
          identifying: true,
          parentSide: "a"
        },

        // 4-way n-ary "takes":
        // Student, Course, Instructor, BuildingRoom
        {
          id: "rTakes",
          name: "takes",
          type: "N:N",           // treat primary ends as many
          a: "student",          // primary end 1
          b: "course",           // primary end 2
          optA: false,
          optB: false,
          extras: ["instructor", "buildingRoom"],

          // Relationship attributes shown as ovals near the diamond
          attributes: [
            { name: "Term",    type: "TEXT", notNull: false },
            { name: "Day/Time", type: "TEXT", notNull: false }
          ]
        }
      ]
    }
  },
  // NEW: Equipment–Bike–Ski specialization hierarchy
  equipmentSpec: {
    label: "Equipment–Bike–Ski (specialization)",
    data: {
      entities: [
        {
          id: "equipment",
          name: "Equipment",
          x: 140,
          y: 260,
          attributes: [
            { name: "EID",   pk: true },
            { name: "Brand", pk: false },
            { name: "Model", pk: false }
          ]
        },
        {
          id: "ski",
          name: "Ski",
          x: 640,
          y: 180,
          attributes: [
            { name: "EID",       pk: true },
            { name: "Length-cm", pk: false }
          ]
        },
        {
          id: "bike",
          name: "Bike",
          x: 640,
          y: 340,
          attributes: [
            { name: "EID",  pk: true },
            { name: "Size", pk: false },
            { name: "Color", pk: false }
          ]
        }
      ],
      relationships: [
        {
          id: "rEquipSpec",
          name: "is",
          type: "1:1",          // 1:1 everywhere for specialization
          a: "equipment",       // supertype
          b: "ski",             // one subtype
          optA: false,
          optB: false,

          // NEW specialization fields
          specializationExtras: ["bike"], // other subtypes
          specializationDisjoint: true,   // d-constraint (disjoint)
          specializationTotal: true      // partial specialization
        }
      ]
    }
  },
  blank: {
    label: "Blank ERD",
    data: {
      entities: [],
      relationships: []
    }
  }
};
