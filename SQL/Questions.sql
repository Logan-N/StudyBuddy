Create Table Questions (
  QuestionID Int Not Null,
  QuizID Int Not Null,
  QuestionText Varchar(256) Not Null,
  Options Varchar(256) Null,
  CorrectAnswer Varchar(256) Not Null,
  Primary Key (QuestionID),
  Foreign Key (QuizID)
  References Quiz(QuizID)
);
