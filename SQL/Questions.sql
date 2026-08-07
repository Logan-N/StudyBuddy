SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[Questions](
	[QuestionID] [int] IDENTITY(1,1) NOT NULL,
	[QuizID] [int] NOT NULL,
	[QuestionNumber] [int] NULL,
	[QuestionText] [varchar](max) NULL,
	[Options] [varchar](max) NULL,
	[CorrectAnswer] [varchar](max) NULL,
	[CreatedDate] [datetime] NULL,
 CONSTRAINT [PK__Question__0DC06F8C5BA11220] PRIMARY KEY CLUSTERED 
(
	[QuestionID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO

ALTER TABLE [dbo].[Questions] ADD  CONSTRAINT [DF_Questions_CreatedDate]  DEFAULT (getdate()) FOR [CreatedDate]
GO

ALTER TABLE [dbo].[Questions]  WITH CHECK ADD  CONSTRAINT [FK__Questions__QuizI__58D1301D] FOREIGN KEY([QuizID])
REFERENCES [dbo].[Quiz] ([QuizID])
GO

ALTER TABLE [dbo].[Questions] CHECK CONSTRAINT [FK__Questions__QuizI__58D1301D]
GO


