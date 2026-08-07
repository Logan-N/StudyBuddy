SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[PlannerActivity](
	[ActivityID] [int] IDENTITY(1,1) NOT NULL,
	[PlannerID] [int] NOT NULL,
	[ActivityType] [char](3) NOT NULL,
	[ActivityDate] [date] NOT NULL,
	[ActivityTitle] [varchar](30) NOT NULL,
	[Notes] [varchar](max) NULL,
	[StartTime] [varchar](5) NULL,
	[EndTime] [varchar](5) NULL,
	[CreatedDate] [datetime] NULL,
 CONSTRAINT [PK_PlannerActivity] PRIMARY KEY CLUSTERED 
(
	[ActivityID] ASC
)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO

ALTER TABLE [dbo].[PlannerActivity] ADD  CONSTRAINT [DF_PlannerActivity_CreatedDate]  DEFAULT (getdate()) FOR [CreatedDate]
GO


