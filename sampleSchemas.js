// sampleSchemas.js

// 1️⃣ Initial query you currently show on first load
window.INITIAL_DEFAULT_QUERY = `
select p.productid, p.productname, p.productprice
from salestransaction st, includes i, product p,
     category c, store s, vendor v, region r
where st.tid      = i.tid
  and i.productid = p.productid
  and p.categoryid = c.categoryid
  and p.vendorid   = v.vendorid
  and st.storeid   = s.storeid
  and s.regionid   = r.regionid
  and v.vendorname = 'Pacifica Gear'
  and r.regionname = 'Tristate'
order by p.ProductID;
`.trim();


// 2️⃣ All built-in schemas + their per-schema default queries
window.DEFAULT_SCHEMAS = [
  {
    name: 'ZAGI operational (Default)',
    script: `
-- Schema 1: ZAGImore
CREATE TABLE vendor (
  vendorid   TEXT NOT NULL,
  vendorname TEXT NOT NULL,
  PRIMARY KEY (vendorid)
);

CREATE TABLE category (
  categoryid   TEXT NOT NULL,
  categoryname TEXT NOT NULL,
  PRIMARY KEY (categoryid)
);

CREATE TABLE product (
  productid    TEXT NOT NULL,
  productname  TEXT NOT NULL,
  productprice REAL NOT NULL,
  vendorid     TEXT NOT NULL,
  categoryid   TEXT NOT NULL,
  PRIMARY KEY (productid),
  FOREIGN KEY (vendorid)   REFERENCES vendor(vendorid),
  FOREIGN KEY (categoryid) REFERENCES category(categoryid)
);

CREATE TABLE region (
  regionid   TEXT NOT NULL,
  regionname TEXT NOT NULL,
  PRIMARY KEY (regionid)
);

CREATE TABLE store (
  storeid  TEXT NOT NULL,
  storezip TEXT NOT NULL,
  regionid TEXT NOT NULL,
  PRIMARY KEY (storeid),
  FOREIGN KEY (regionid) REFERENCES region(regionid)
);

CREATE TABLE customer (
  customerid   TEXT NOT NULL,
  customername TEXT NOT NULL,
  customerzip  TEXT NOT NULL,
  PRIMARY KEY (customerid)
);

CREATE TABLE salestransaction (
  tid        TEXT NOT NULL,
  customerid TEXT NOT NULL,
  storeid    TEXT NOT NULL,
  tdate      TEXT NOT NULL,
  PRIMARY KEY (tid),
  FOREIGN KEY (customerid) REFERENCES customer(customerid),
  FOREIGN KEY (storeid)    REFERENCES store(storeid)
);

CREATE TABLE includes (
  productid TEXT NOT NULL,
  tid       TEXT NOT NULL,
  quantity  INTEGER NOT NULL,
  PRIMARY KEY (productid, tid),
  FOREIGN KEY (productid) REFERENCES product(productid),
  FOREIGN KEY (tid)       REFERENCES salestransaction(tid)
);

-- *** INSERT statements ***

INSERT INTO vendor VALUES ('PG','Pacifica Gear');
INSERT INTO vendor VALUES ('MK','Mountain King');
INSERT INTO vendor VALUES ('OA','Outdoor Adventures');
INSERT INTO vendor VALUES ('WL','Wilderness Limited');
INSERT INTO vendor VALUES ('PO', 'Peak Outfitters');

INSERT INTO category VALUES ('CP','Camping');
INSERT INTO category VALUES ('FW','Footwear');
INSERT INTO category VALUES ('CL','Climbing');
INSERT INTO category VALUES ('EL','Electronics');
INSERT INTO category VALUES ('CY','Cycling');

INSERT INTO product VALUES ('1X1','Zzz Bag',100,'PG','CP');
INSERT INTO product VALUES ('2X2','Easy Boot',70,'MK','FW');
INSERT INTO product VALUES ('3X3','Cosy Sock',15,'MK','FW');
INSERT INTO product VALUES ('4X4','Dura Boot',90,'PG','FW');
INSERT INTO product VALUES ('5X5','Tiny Tent',150,'MK','CP');
INSERT INTO product VALUES ('6X6','Biggy Tent',250,'MK','CP');
INSERT INTO product VALUES ('7X7','Hi-Tec GPS',300,'OA','EL');
INSERT INTO product VALUES ('8X8','Power Pedals',20,'MK','CY');
INSERT INTO product VALUES ('9X9','Trusty Rope',30,'WL','CL');
INSERT INTO product VALUES ('1X2','Comfy Harness',150,'MK','CL');
INSERT INTO product VALUES ('1X3','Sunny Charger',125,'OA','EL');
INSERT INTO product VALUES ('1X4','Safe-T Helmet',40,'PG','CY');
INSERT INTO product VALUES ('2X1','Mmm Stove',80,'WL','CP');
INSERT INTO product VALUES ('2X3','Reflect-o Jacket',35,'PG','CY');
INSERT INTO product VALUES ('2X4','Strongster Carribeaner',20,'MK','CL');
INSERT INTO product VALUES ('3X1','Sleepy Pad',25,'WL','CP');
INSERT INTO product VALUES ('3X2','Bucky Knife',60,'WL','CP');
INSERT INTO product VALUES ('3X4','Treado Tire',30,'OA','CY');
INSERT INTO product VALUES ('4X1','Slicky Tire',25,'OA','CY');
INSERT INTO product VALUES ('4X2','Electra Compass',45,'MK','EL');
INSERT INTO product VALUES ('4X3','Mega Camera',275,'WL','EL');
INSERT INTO product VALUES ('5X1','Simple Sandal',50,'PG','FW');
INSERT INTO product VALUES ('5X2','Action Sandal',70,'PG','FW');
INSERT INTO product VALUES ('5X3','Luxo Tent',500,'OA','CP');

INSERT INTO region VALUES ('C','Chicagoland');
INSERT INTO region VALUES ('T','Tristate');
INSERT INTO region VALUES ('I','Indiana');
INSERT INTO region VALUES ('N','North');

INSERT INTO store VALUES ('S1','60600','C');
INSERT INTO store VALUES ('S2','60605','C');
INSERT INTO store VALUES ('S3','35400','T');
INSERT INTO store VALUES ('S4','60640','C');
INSERT INTO store VALUES ('S5','46307','T');
INSERT INTO store VALUES ('S6','47374','I');
INSERT INTO store VALUES ('S7','47401','I');
INSERT INTO store VALUES ('S8','55401','N');
INSERT INTO store VALUES ('S9','54937','N');
INSERT INTO store VALUES ('S10','60602','C');
INSERT INTO store VALUES ('S11','46201','I');
INSERT INTO store VALUES ('S12','55701','N');
INSERT INTO store VALUES ('S13','60085','T');
INSERT INTO store VALUES ('S14','53140','T');

INSERT INTO customer VALUES ('1-2-333','Tina','60137');
INSERT INTO customer VALUES ('2-3-444','Tony','60611');
INSERT INTO customer VALUES ('3-4-555','Pam','35401');
INSERT INTO customer VALUES ('4-5-666','Elly','47374');
INSERT INTO customer VALUES ('5-6-777','Nora','60640');
INSERT INTO customer VALUES ('6-7-888','Miles','60602');
INSERT INTO customer VALUES ('7-8-999','Neil','55403');
INSERT INTO customer VALUES ('8-9-000','Maggie','47401');
INSERT INTO customer VALUES ('9-0-111','Ryan','46202');
INSERT INTO customer VALUES ('0-1-222','Dan','55499');

INSERT INTO salestransaction VALUES ('T111','1-2-333','S1','2020-01-01');
INSERT INTO salestransaction VALUES ('T222','2-3-444','S2','2020-01-01');
INSERT INTO salestransaction VALUES ('T333','1-2-333','S3','2020-01-02');
INSERT INTO salestransaction VALUES ('T444','3-4-555','S3','2020-01-02');
INSERT INTO salestransaction VALUES ('T555','2-3-444','S3','2020-01-02');
INSERT INTO salestransaction VALUES ('T666','5-6-777','S10','2020-01-03');
INSERT INTO salestransaction VALUES ('T777','6-7-888','S13','2020-01-03');
INSERT INTO salestransaction VALUES ('T888','8-9-000','S4','2020-01-04');
INSERT INTO salestransaction VALUES ('T999','4-5-666','S6','2020-01-04');
INSERT INTO salestransaction VALUES ('T101','7-8-999','S12','2020-01-04');
INSERT INTO salestransaction VALUES ('T202','0-1-222','S8','2020-01-04');
INSERT INTO salestransaction VALUES ('T303','4-5-666','S6','2020-01-05');
INSERT INTO salestransaction VALUES ('T404','8-9-000','S6','2020-01-05');
INSERT INTO salestransaction VALUES ('T505','6-7-888','S13','2020-01-05');
INSERT INTO salestransaction VALUES ('T606','0-1-222','S11','2020-01-06');
INSERT INTO salestransaction VALUES ('T707','5-6-777','S4','2020-01-06');
INSERT INTO salestransaction VALUES ('T808','7-8-999','S9','2020-01-06');
INSERT INTO salestransaction VALUES ('T909','5-6-777','S4','2020-01-06');
INSERT INTO salestransaction VALUES ('T011','8-9-000','S7','2020-01-07');
INSERT INTO salestransaction VALUES ('T022','9-0-111','S5','2020-01-07');

INSERT INTO includes VALUES ('1X1','T111',1);
INSERT INTO includes VALUES ('2X2','T222',1);
INSERT INTO includes VALUES ('3X3','T333',5);
INSERT INTO includes VALUES ('1X1','T333',1);
INSERT INTO includes VALUES ('4X4','T444',1);
INSERT INTO includes VALUES ('2X2','T444',2);
INSERT INTO includes VALUES ('4X4','T555',4);
INSERT INTO includes VALUES ('5X5','T555',2);
INSERT INTO includes VALUES ('6X6','T555',1);
INSERT INTO includes VALUES ('7X7','T666',1);
INSERT INTO includes VALUES ('9X9','T666',1);
INSERT INTO includes VALUES ('1X3','T666',2);
INSERT INTO includes VALUES ('8X8','T777',1);
INSERT INTO includes VALUES ('1X4','T888',4);
INSERT INTO includes VALUES ('2X3','T888',3);
INSERT INTO includes VALUES ('9X9','T999',1);
INSERT INTO includes VALUES ('1X2','T999',5);
INSERT INTO includes VALUES ('8X8','T999',3);
INSERT INTO includes VALUES ('1X3','T999',1);
INSERT INTO includes VALUES ('1X2','T101',3);
INSERT INTO includes VALUES ('1X4','T101',1);
INSERT INTO includes VALUES ('2X4','T202',4);
INSERT INTO includes VALUES ('9X9','T303',3);
INSERT INTO includes VALUES ('1X4','T303',2);
INSERT INTO includes VALUES ('2X1','T303',2);
INSERT INTO includes VALUES ('3X1','T303',2);
INSERT INTO includes VALUES ('2X4','T404',1);
INSERT INTO includes VALUES ('2X3','T404',2);
INSERT INTO includes VALUES ('2X2','T505',3);
INSERT INTO includes VALUES ('3X2','T505',1);
INSERT INTO includes VALUES ('2X1','T505',4);
INSERT INTO includes VALUES ('3X1','T505',2);
INSERT INTO includes VALUES ('2X4','T606',7);
INSERT INTO includes VALUES ('3X1','T606',4);
INSERT INTO includes VALUES ('2X2','T606',3);
INSERT INTO includes VALUES ('3X4','T606',2);
INSERT INTO includes VALUES ('4X4','T606',2);
INSERT INTO includes VALUES ('4X2','T606',1);
INSERT INTO includes VALUES ('3X2','T707',1);
INSERT INTO includes VALUES ('3X4','T707',4);
INSERT INTO includes VALUES ('4X1','T707',2);
INSERT INTO includes VALUES ('5X3','T808',1);
INSERT INTO includes VALUES ('4X2','T808',1);
INSERT INTO includes VALUES ('2X2','T808',1);
INSERT INTO includes VALUES ('4X3','T808',1);
INSERT INTO includes VALUES ('3X3','T808',4);
INSERT INTO includes VALUES ('4X2','T909',3);
INSERT INTO includes VALUES ('6X6','T909',1);
INSERT INTO includes VALUES ('3X3','T011',3);
INSERT INTO includes VALUES ('4X3','T022',3);
INSERT INTO includes VALUES ('2X2','T022',3);
INSERT INTO includes VALUES ('5X1','T022',2);
`.trim(),

    defaultQuery: `
select r.regionname, sum(quantity * productprice) as totalsales
from salestransaction st, includes i, customer c,
     product p, category cat, vendor v, store s, region r
where st.tid        = i.tid
  and i.productid   = p.productid
  and st.customerid = c.customerid
  and p.categoryid  = cat.categoryid
  and p.vendorid    = v.vendorid
  and st.storeid    = s.storeid
  and s.regionid    = r.regionid
  and v.vendorname  = 'Mountain King'
group by r.regionname;
    `.trim()
  },

  {
    name: 'ZAGI Data Warehouse',
    script: `
-- Schema 2: ZAGI DW
-- Calendar dimension
CREATE TABLE calendar (
	calendarkey INTEGER,
	fulldate    TEXT,
	dayofweek   TEXT,
	dayofmonth  INTEGER,
	month       TEXT,
	quarter     TEXT,
	year        INTEGER,
	PRIMARY KEY (calendarkey)
);

-- Store dimension
CREATE TABLE store (
	storekey        INTEGER,
	storeid         TEXT,
	storezip        TEXT,
	storeregionname TEXT,
	storesize       INTEGER,
	storecssystem   TEXT,
	storelayout     TEXT,
	PRIMARY KEY (storekey)
);

-- Product dimension
CREATE TABLE product (
	productkey          INTEGER,
	productid           TEXT,
	productname         TEXT,
	productprice        REAL,
	productvendorname   TEXT,
	productcategoryname TEXT,
	PRIMARY KEY (productkey)
);

-- Customer dimension
CREATE TABLE customer (
	customerkey             INTEGER,
	customerid              TEXT,
	customername            TEXT,
	customerzip             TEXT,
	customergender          TEXT,
	customermaritalstatus   TEXT,
	customermeducationlevel TEXT,
	customercreditscore     INTEGER,
	PRIMARY KEY (customerkey)
);

-- Fact table
CREATE TABLE sales (
	calendarkey INTEGER,
	storekey    INTEGER,
	productkey  INTEGER,
	customerkey INTEGER,
	tid         TEXT,
	timeofday   TEXT,
	dollarsold  REAL,
	unitssold   INTEGER,
	PRIMARY KEY (productkey, tid),
	FOREIGN KEY (calendarkey) REFERENCES calendar(calendarkey),
	FOREIGN KEY (storekey)    REFERENCES store(storekey),
	FOREIGN KEY (productkey)  REFERENCES product(productkey),
	FOREIGN KEY (customerkey) REFERENCES customer(customerkey)
);

-- Calendar data
INSERT INTO calendar VALUES (1, '1-Jan-2020', 'Wednesday', 1, 'January', 'Q1', 2020);
INSERT INTO calendar VALUES (2, '2-Jan-2020', 'Thursday', 2, 'January', 'Q1', 2020);
INSERT INTO calendar VALUES (3, '3-Jan-2020', 'Friday', 3, 'January', 'Q1', 2020);
INSERT INTO calendar VALUES (4, '4-Jan-2020', 'Saturday', 4, 'January', 'Q1', 2020);
INSERT INTO calendar VALUES (5, '5-Jan-2020', 'Sunday', 5, 'January', 'Q1', 2020);
INSERT INTO calendar VALUES (6, '6-Jan-2020', 'Monday', 6, 'January', 'Q1', 2020);
INSERT INTO calendar VALUES (7, '7-Jan-2020', 'Tuesday', 7, 'January', 'Q1', 2020);
INSERT INTO calendar VALUES (8, '8-Jan-2020', 'Wednesday', 8, 'January', 'Q1', 2020);

	  -- Store data
INSERT INTO store VALUES (1,  'S1',  '60600', 'Chicagoland', 51000, 'Cashiers',      'Modern');
INSERT INTO store VALUES (2,  'S2',  '60605', 'Chicagoland', 35000, 'Self Service',  'Traditional');
INSERT INTO store VALUES (3,  'S3',  '35400', 'Tristate',    55000, 'Mixed',         'Traditional');
INSERT INTO store VALUES (4,  'S4',  '60640', 'Chicagoland', 40000, 'Cashiers',      'Modern');
INSERT INTO store VALUES (5,  'S5',  '46307', 'Tristate',    45000, 'Self Service',  'Traditional');
INSERT INTO store VALUES (6,  'S6',  '47374', 'Indiana',     50000, 'Mixed',         'Traditional');
INSERT INTO store VALUES (7,  'S7',  '47401', 'Indiana',     35000, 'Cashiers',      'Modern');
INSERT INTO store VALUES (8,  'S8',  '55401', 'North',       48000, 'Self Service',  'Modern');
INSERT INTO store VALUES (9,  'S9',  '54937', 'North',       42000, 'Mixed',         'Modern');
INSERT INTO store VALUES (10, 'S10', '60602', 'Chicagoland', 35000, 'Cashiers',      'Traditional');
INSERT INTO store VALUES (11, 'S11', '46201', 'Indiana',     55000, 'Self Service',  'Modern');
INSERT INTO store VALUES (12, 'S12', '55701', 'North',       40000, 'Mixed',         'Traditional');
INSERT INTO store VALUES (13, 'S13', '60085', 'Tristate',    45000, 'Self Service',  'Traditional');
INSERT INTO store VALUES (14, 'S14', '53140', 'Tristate',    50000, 'Mixed',         'Modern');
INSERT INTO store VALUES (15, 'S0', '24845', 'South',    	 32000, 'Cashiers',      'Closed store');

-- Customer data
INSERT INTO customer VALUES (1,  '1-2-333', 'Tina',   '60137', 'Single',  'Female', 'College',      700);
INSERT INTO customer VALUES (2,  '2-3-444', 'Tony',   '60611', 'Single',  'Male',   'High School',  650);
INSERT INTO customer VALUES (3,  '3-4-555', 'Pam',    '35401', 'Married', 'Female', 'College',      623);
INSERT INTO customer VALUES (4,  '4-5-666', 'Elly',   '47374', 'Single',  'Male',   'High School',  690);
INSERT INTO customer VALUES (5,  '5-6-777', 'Nora',   '60640', 'Married', 'Female', 'College',      625);
INSERT INTO customer VALUES (6,  '6-7-888', 'Miles',  '60602', 'Single',  'Male',   'College',      710);
INSERT INTO customer VALUES (7,  '7-8-999', 'Neil',   '55403', 'Married', 'Female', 'College',      725);
INSERT INTO customer VALUES (8,  '8-9-000', 'Maggie', '47401', 'Married', 'Male',   'High School',  635);
INSERT INTO customer VALUES (9,  '9-0-111', 'Ryan',   '46202', 'Single',  'Male',   'High School',  730);
INSERT INTO customer VALUES (10, '0-1-222', 'Dan',    '55499', 'Married', 'Female', 'College',      750);

-- Product data
INSERT INTO product VALUES (1,  '1X1', 'Zzz Bag',                 100, 'Pacifica Gear',        'Camping');
INSERT INTO product VALUES (2,  '2X2', 'Easy Boot',                70, 'Mountain King',        'Footwear');
INSERT INTO product VALUES (3,  '3X3', 'Cosy Sock',                15, 'Mountain King',        'Footwear');
INSERT INTO product VALUES (4,  '4X4', 'Dura Boot',                90, 'Pacifica Gear',        'Footwear');
INSERT INTO product VALUES (5,  '5X5', 'Tiny Tent',               150, 'Mountain King',        'Camping');
INSERT INTO product VALUES (6,  '6X6', 'Biggy Tent',              250, 'Mountain King',        'Camping');
INSERT INTO product VALUES (7,  '1X2', 'Comfy Harness',           150, 'Mountain King',        'Climbing');
INSERT INTO product VALUES (8,  '1X3', 'Sunny Charger',           125, 'Outdoor Adventures',   'Electronics');
INSERT INTO product VALUES (9,  '1X4', 'Safe-T Helmet',            40, 'Pacifica Gear',        'Cycling');
INSERT INTO product VALUES (10, '2X1', 'Mmm Stove',                80, 'Wilderness Limited',   'Camping');
INSERT INTO product VALUES (11, '2X3', 'Reflect-o Jacket',         35, 'Pacifica Gear',        'Cycling');
INSERT INTO product VALUES (12, '2X4', 'Strongster Carribeaner',   20, 'Mountain King',        'Climbing');
INSERT INTO product VALUES (13, '3X1', 'Sleepy Pad',               25, 'Wilderness Limited',   'Camping');
INSERT INTO product VALUES (14, '3X2', 'Bucky Knife',              60, 'Wilderness Limited',   'Camping');
INSERT INTO product VALUES (15, '3X4', 'Treado Tire',              30, 'Outdoor Adventures',   'Cycling');
INSERT INTO product VALUES (16, '4X1', 'Slicky Tire',              25, 'Outdoor Adventures',   'Cycling');
INSERT INTO product VALUES (17, '4X2', 'Electra Compass',          45, 'Mountain King',        'Electronics');
INSERT INTO product VALUES (18, '4X3', 'Mega Camera',             275, 'Wilderness Limited',   'Electronics');
INSERT INTO product VALUES (19, '5X1', 'Simple Sandal',            50, 'Pacifica Gear',        'Footwear');
INSERT INTO product VALUES (20, '5X2', 'Action Sandal',            70, 'Pacifica Gear',        'Footwear');
INSERT INTO product VALUES (21, '5X3', 'Luxo Tent',               500, 'Outdoor Adventures',   'Camping');
INSERT INTO product VALUES (22, '7X7', 'Hi-Tec GPS',              300, 'Outdoor Adventures',   'Electronics');
INSERT INTO product VALUES (23, '8X8', 'Power Pedals',             20, 'Mountain King',        'Cycling');
INSERT INTO product VALUES (24, '9X9', 'Trusty Rope',              30, 'Wilderness Limited',   'Climbing');

-- Sales fact data
INSERT INTO sales VALUES (1, 1,  1,  1,  'T111', '08:23:59 AM', 100, 1);
INSERT INTO sales VALUES (1, 2,  2,  2,  'T222', '08:24:30 AM',  70, 1);
INSERT INTO sales VALUES (2, 3,  1,  1,  'T333', '08:15:08 AM', 100, 1);
INSERT INTO sales VALUES (2, 3,  2,  3,  'T444', '08:20:33 AM', 140, 2);
INSERT INTO sales VALUES (2, 3,  3,  1,  'T333', '08:15:08 AM',  75, 5);
INSERT INTO sales VALUES (2, 3,  4,  3,  'T444', '08:20:33 AM',  90, 1);
INSERT INTO sales VALUES (2, 3,  4,  2,  'T555', '08:30:00 AM', 360, 4);
INSERT INTO sales VALUES (2, 3,  5,  2,  'T555', '08:30:00 AM', 300, 2);
INSERT INTO sales VALUES (2, 3,  6,  2,  'T555', '08:30:00 AM', 250, 1);
INSERT INTO sales VALUES (3, 10, 8,  5,  'T666', '08:00:00 AM', 250, 2);
INSERT INTO sales VALUES (3, 10, 22, 5,  'T666', '08:00:00 AM', 300, 1);
INSERT INTO sales VALUES (3, 13, 23, 6,  'T777', '08:10:00 AM',  20, 1);
INSERT INTO sales VALUES (3, 10, 24, 5,  'T666', '08:00:00 AM',  30, 1);
INSERT INTO sales VALUES (4, 12, 7,  7,  'T101', '01:27:53 PM', 450, 3);
INSERT INTO sales VALUES (4, 6,  7,  4,  'T999', '08:07:33 AM', 750, 5);
INSERT INTO sales VALUES (4, 6,  8,  4,  'T999', '08:07:33 AM', 125, 1);
INSERT INTO sales VALUES (4, 12, 9,  7,  'T101', '01:27:53 PM',  40, 1);
INSERT INTO sales VALUES (4, 4,  9,  8,  'T888', '08:05:00 AM', 160, 4);
INSERT INTO sales VALUES (4, 4,  11, 8,  'T888', '08:05:00 AM', 105, 3);
INSERT INTO sales VALUES (4, 8,  12, 10, 'T202', '03:05:34 PM',  80, 4);
INSERT INTO sales VALUES (4, 6,  23, 4,  'T999', '08:07:33 AM',  60, 3);
INSERT INTO sales VALUES (4, 6,  24, 4,  'T999', '08:07:33 AM',  30, 1);
INSERT INTO sales VALUES (5, 6,  9,  4,  'T303', '11:05:34 AM',  80, 2);
INSERT INTO sales VALUES (5, 6,  10, 4,  'T303', '11:05:34 AM', 160, 2);
INSERT INTO sales VALUES (5, 14, 10, 6,  'T505', '02:37:00 PM', 320, 4);
INSERT INTO sales VALUES (5, 14, 2,  6,  'T505', '02:37:00 PM', 210, 3);
INSERT INTO sales VALUES (5, 6,  11, 8,  'T404', '12:15:02 PM',  70, 2);
INSERT INTO sales VALUES (5, 6,  12, 8,  'T404', '12:15:02 PM',  20, 1);
INSERT INTO sales VALUES (5, 6,  13, 4,  'T303', '11:05:34 AM',  50, 2);
INSERT INTO sales VALUES (5, 14, 14, 6,  'T505', '02:37:00 PM',  60, 1);
INSERT INTO sales VALUES (5, 6,  24, 4,  'T303', '11:05:34 AM',  90, 3);
INSERT INTO sales VALUES (6, 11, 2,  10, 'T606', '06:25:00 PM', 210, 3);
INSERT INTO sales VALUES (6, 9,  2,  7,  'T808', '08:28:18 PM',  70, 1);
INSERT INTO sales VALUES (6, 11, 12, 10, 'T606', '06:25:00 PM', 140, 7);
INSERT INTO sales VALUES (6, 11, 13, 10, 'T606', '06:25:00 PM', 100, 4);
INSERT INTO sales VALUES (6, 4,  14, 5,  'T707', '07:17:27 PM',  60, 1);
INSERT INTO sales VALUES (6, 9,  3,  7,  'T808', '08:28:18 PM',  60, 4);
INSERT INTO sales VALUES (6, 11, 15, 10, 'T606', '06:25:00 PM',  60, 2);
INSERT INTO sales VALUES (6, 4,  15, 5,  'T707', '07:17:27 PM', 120, 4);
INSERT INTO sales VALUES (6, 4,  16, 5,  'T707', '07:17:27 PM',  50, 2);
INSERT INTO sales VALUES (6, 9,  17, 7,  'T808', '08:28:18 PM',  45, 1);
INSERT INTO sales VALUES (6, 4,  17, 5,  'T909', '09:09:01 PM', 135, 3);
INSERT INTO sales VALUES (6, 9,  18, 7,  'T808', '08:28:18 PM', 275, 1);
INSERT INTO sales VALUES (6, 11, 4,  10, 'T606', '06:25:00 PM', 180, 2);
INSERT INTO sales VALUES (6, 9,  21, 7,  'T808', '08:28:18 PM', 500, 1);
INSERT INTO sales VALUES (6, 4,  6,  5,  'T909', '09:09:01 PM', 250, 1);
INSERT INTO sales VALUES (7, 5,  2,  9,  'T022', '12:07:30 PM', 210, 3);
INSERT INTO sales VALUES (7, 7,  3,  8,  'T011', '11:11:10 AM',  45, 3);
INSERT INTO sales VALUES (7, 5,  18, 9,  'T022', '12:07:30 PM', 825, 3);
INSERT INTO sales VALUES (7, 5,  19, 9,  'T022', '12:07:30 PM', 100, 2);
`.trim(),

    defaultQuery: `
select st.storeregionname, sum(dollarsold) as totalsales
from product pr, sales s, store st
where pr.productkey = s.productkey
  and st.storekey    = s.storekey
  and pr.productvendorname = 'Mountain King'
group by st.storeregionname;
    `.trim()
  }
];