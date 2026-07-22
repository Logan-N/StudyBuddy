//Connect to Azure Functions
const { app } = require("@azure/functions");
//Connect to Database
const { getConnection } = require("../../database");
//Connect to bcrypt for password hashing
const bcrypt = require("bcrypt");

app.http("Register", {
    //Uses POST request to send data to the database
    methods: ["POST"],
    //Doesn't require Azure Authentication
    authLevel: "anonymous",
    //Function that will register the user in the database
    handler: async (request) => {
        try {
            //Get the data from the registration form and store it in variables
            const {email, password } = await request.json();

            //Make sure all fields are filled out
            if (!email || !password) {
                return {
                    status: 400,
                    jsonbody: {
                    message: "Please fill out all fields."
                    }
                };
        
            };

            //Connect to the database and store the connection in a variable
            const connection = await getConnection();

            // Check if the email already exists in the database
            const existingUser = await connection.request()
                .input("email", sql.NVarChar, email)
                .query(
                    "SELECT UserID FROM Users WHERE Email = @email"
                );

            //If username or email already exists, return a 400 status code and an error message
            if (existingUser.length > 0) {
                return {
                    status: 400,
                    jsonbody: {
                    message: "email already exists."
                    }
                };
            }
            //If no existing user is found, proceed with registration
            //Hash the password using bcrypt and salts
            const hashedPassword = await bcrypt.hash(password, 12);

            //Insert the new user into the database
            await connection.request()
                .input("email", sql.VarChar, email)
                .input("password", sql.VarChar, hashedPassword)
                .query(
                    "INSERT INTO Users (Email, Password) VALUES (@email, @password)"
                );
            //Return a 200 status code and a success message
            return {
                status: 200,
                jsonbody: {
                    message: "User registered successfully."
                }
            };
        }
        
        //If error occurs, return a 500 status code and the error message
        catch (error) {
            return {
                status: 500,
                jsonbody: {
                    message: "User registration failed: " + error.message
                }
            };
        }
    }
});
