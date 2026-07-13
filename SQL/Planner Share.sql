create TABLE Planner(
	ShareID INTEGER(6) NOT NULL,
    PlannerID INTEGER(6) NOT NULL,
    PRIMARY KEY (ShareID),
    FOREIGN KEY (PlannerID)
		REFERENCES Planner(PlannerID)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);