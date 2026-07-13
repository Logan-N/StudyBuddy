CREATE TABLE PlannerActivityTable (
ActivityID INTEGER(6) NOT NULL,
PlannerID INTEGER(6) NOT NULL,
ActivityType CHAR(3) NOT NULL,
ActivityDate DATE NOT NULL,
ActivityTitle VARCHAR(30) NOT NULL,
Notes MEDIUMTEXT default ' ',
PRIMARY KEY (ActivityID),
FOREIGN KEY (PlannerID)
        REFERENCES Planner (PlannerID)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    );
