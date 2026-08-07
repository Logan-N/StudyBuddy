SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[Quiz](
	[QuizID] [int] IDENTITY(1,1) NOT NULL,
	[UserID] [int] NOT NULL,
	[CreatedDate] [datetime] NOT NULL,
	[Title] [varchar](100) NULL,
	[Topic] [varchar](255) NULL,
	[Difficulty] [varchar](20) NULL,
	[QuizTypeID] [char](3) NOT NULL,
 CONSTRAINT [PK__Quiz__8B42AE6EFF4855CE] PRIMARY KEY CLUSTERED 
(
	[QuizID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO

ALTER TABLE [dbo].[Quiz] ADD  CONSTRAINT [DF_Quiz_CreatedDate]  DEFAULT (getdate()) FOR [CreatedDate]
GO

ALTER TABLE [dbo].[Quiz]  WITH CHECK ADD  CONSTRAINT [FK_Quiz_QuizType] FOREIGN KEY([QuizTypeID])
REFERENCES [dbo].[QuizType] ([QuizTypeID])
GO

ALTER TABLE [dbo].[Quiz] CHECK CONSTRAINT [FK_Quiz_QuizType]
GO

