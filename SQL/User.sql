create TABLE User(
	UserID INTEGER(6) NOT NULL,
    email VARCHAR(256) NOT NULL,
    password VARCHAR(256) NOT NULL,
    CreatedDate DATE NOT NULL,
    PRIMARY KEY (UserID)
);