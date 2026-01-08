/* erd-presets.js
   Option B (no modules): define presets on window so erd.js can use them
   Works from local file system (file://) as long as this file is loaded
   BEFORE erd.js in your HTML.
*/

// All sample ERDs live here
window.ERD_PRESETS = {
  // Simple 3 entities with 2 relationships 
  twoBinary: {
    label: "Student–Registration–Course (binary)",
    data: {
      entities: [
        { id:"student", name:"Student", x:60,  y:180, attributes:[
          { name:"SSN", pk:true }, { name:"Name", pk:false }
        ]},
        { id:"registration", name:"Registration", x:360,y:180, attributes:[
          { name:"SSN", pk:true }, { name:"CRN", pk:true }
        ]},
        { id:"course", name:"Course", x:660,y:180, attributes:[
          { name:"CRN", pk:true }, { name:"CourseName", pk:false }
        ]}
      ],
      relationships: [
        {
          id: "r1",
          name: "signsup",
          type: "1:N",
          a: "student",
          b: "registration",
          optA: false,
          optB: true
        },
        {
          id: "r2",
          name: "has",
          type: "1:N",
          a: "course",
          b: "registration",
          optA: false,
          optB: true
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
