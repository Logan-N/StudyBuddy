//Connect to Azure Functions
const { app } = require("@azure/functions");
//Connect to Database
const { getConnection } = require("../../database");

app.http("Register", {
    //Uses POST request to send data to the database
    methods: ["POST"],
    //Doesn't require Azure Authentication
    authLevel: "anonymous",
    //Function that will register the user in the database
    handler: async () => {
        try {
            //Get the data from the registration form and store it in variables
            const {email, password } = await request.json();

            //Make sure all fields are filled out
            if (!email || !password) {
                return {
                    status: 400,
                    message: "Please fill out all fields."
                };
        
            };

            //Connect to the database and store the connection in a variable
            const connection = await getConnection();

            //Check if the username or email already exists in the database
            const existingUser = await connection.query
            (
                //Query the database for a user with the same username or email
                "SELECT * FROM users WHERE email = email",
            );

            //If username or email already exists, return a 400 status code and an error message
            if (existingUser.length > 0) {
                return {
                    status: 400,
                    message: "email already exists."
                };
            }
            //If no existing user is found, proceed with registration
            //Hash the password using bcrypt and salts
            const hashedPassword = await bcrypt.hash(password, 12);

            //Insert the new user into the database
            await connection.query
            (
                "INSERT INTO users (email, password) VALUES (email, hashedPassword)"
            );
            //Return a 200 status code and a success message
            return {
                status: 200,
                message: "User registered successfully."
            };
        }
        
        //If error occurs, return a 500 status code and the error message
        catch (error) {
            return {
                status: 500,
                message: "User registration failed: " + error.message
            };
        }
    }
});
