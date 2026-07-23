Create Table Questions (
  QuestionID Int(6) Not Null,
  QuizID Int(6) Not Null,
  QuestionText Varchar(256) Not Null,
  Options Varchar(256) Null,
  CorrectAnswer Varchar(256) Not Null,
  Primary Key (QuestionID),
  Foreign Key (QuizID),
    References Quiz(QuizID)
    ON DELETE Cascade
    ON UPDATE Cascade
);
