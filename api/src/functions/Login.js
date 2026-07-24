//Connect to Azure Functions
const { app } = require("@azure/functions");
//Connect to Database and SQL Server
const { getConnection, sql } = require("../../database");
//Connect to bcrypt for password hashing
const bcrypt = require("bcrypt");
//Connect to jsonwebtoken for creating and verifying tokens
const jwt = require("jsonwebtoken");
app.http("Login", {
    //Uses POST request to send data to the database
    methods: ["POST"],
    //Doesn't require Azure Authentication
    authLevel: "anonymous",
    //Function that will log the user in and return a success message
    handler: async (request) => {
        try {
            //Get the data from the login form and store it in variables
            const { email, password } = await request.json();

            //Make sure all fields are filled out
            if (!email || !password) {
                return {
                    status: 400,
                    jsonBody: {
                        message: "Please fill out all fields."
                    }
                };
            };

            //Connect to the database and store the connection in a variable
            const connection = await getConnection();

            //Query the database for the user with given email and store the result in a variable
            const user = await connection.request()
                .input("email", sql.VarChar, email)
                .query(
                    "SELECT UserID, Email, Password FROM Users WHERE Email = @email"
                );

            //If no user is found, return a 401 status code and an error message
            if (user.recordset.length === 0) {
                return {
                    status: 401,
                    jsonBody: {
                        message: "User does not exist. You may need to register first."
                    }
                };
            }

            //Compare the provided password with the hashed password in the database
            const isMatch = await bcrypt.compare(password, user.recordset[0].Password);

            //If the passwords don't match, return a 401 status code and an error message
            if (!isMatch) {
                return {
                    status: 401,
                    jsonBody: {
                        message: "Invalid email or password."
                    }
                };
            }

            //Create a token with the user's ID
            const token = jwt.sign
            (
                { 
                    userID: user.recordset[0].UserID,
                    email: user.recordset[0].Email
                }, 
                process.env.JWT_SECRET,
                { 
                    expiresIn: "1h" 
                }
            );

            //If the passwords match, return a 200 status code and a success message
            return {
                status: 200,
                jsonBody: {
                    message: "Login successful.",
                    token
                }
            };
            
        } catch (error) {
            console.error("Error occurred while logging in:", error);
            return {
                status: 500,
                jsonBody: {
                    message: "An error occurred while logging in."
                }
            };
        }
    }
});