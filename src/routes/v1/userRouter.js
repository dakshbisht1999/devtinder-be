const express = require("express");
const userRouter = express.Router();

const { UserModel } = require("./../../models/user");
const {AppError} = require("./../../utils/AppError");
const { connectionRequestModel } = require("../../models/connectionRequest");

const USER_SAFE_DATA = ["firstName", "lastName", "photoUrl", "gender", "age", "about", "skills"];

userRouter.get("/requests/received", async (req,res,next)=>{
    try{
        const loggedInUser = req.user;

        //pagination work
        const page = parseInt(req.query?.page) || 1;
        let limit = parseInt(req.query?.limit) || 10;
        limit = limit>50 ? 50 : limit;
        const skip = (page-1)*limit;

        const matchCondition = {
            toUserId: loggedInUser._id,
            status: "interested"
        };
        const [totalItems, requests] = await Promise.all([
            connectionRequestModel.countDocuments(matchCondition),
            connectionRequestModel.find(matchCondition).populate("fromUserId",USER_SAFE_DATA)
                .skip(skip) //skip documents for next pages 
                .limit(limit) //limit documents per page
        ])

        res.send({
            success:true,
            message: "Connection requests fetched successfully",
            data: requests,
            pagination: {
                totalItems,
                currentPage: Math.floor(skip / limit) + 1,
                totalPages: Math.ceil(totalItems / limit),
                hasMore: skip + requests.length < totalItems
            }
        })
    } catch(error){
        next(error);
    }
})

userRouter.get("/connections", async (req,res,next)=>{
    try{
        const loggedInUser = req.user;

        //pagination work
        const page = parseInt(req.query?.page) || 1;
        let limit = parseInt(req.query?.limit) || 10;
        limit = limit>50 ? 50 : limit;
        const skip = (page-1)*limit;

        // // fetch both records fromUserId and toUserId, increases the load on mongodb server
        // // and increases the load on nodejs server to filter the response using JS map method.
        // // suppose in case of 500 connections, it will fetch 1000 records from mongodb and then filters here in nodejs server to return only 500
        // const connections1 = await connectionRequestModel.find({
        //     $or: [
        //         { toUserId: loggedInUser._id, status: "accepted" },
        //         { fromUserId: loggedInUser._id, status: "accepted" },
        //     ]
        // })
        //     .populate("fromUserId",USER_SAFE_DATA)
        //     .populate("toUserId",USER_SAFE_DATA);

        // const data = connections1.map((row)=>{
        //     if(row.fromUserId._id.toString() === loggedInUser._id.toString()){
        //         return row.toUserId
        //     }
        //     return row.fromUserId
        // })

        // using aggregation pipeline (filter all the data in mongodb server using operators and conditions in AP)
        // reduce load on nodejs server
        // 1. Extract the match condition into a variable so you don't repeat yourself
        const matchCondition = {
            status: "accepted",
            $or: [
                { toUserId: loggedInUser._id },
                { fromUserId: loggedInUser._id }
            ]
        };
        const [totalItems, connections2] = await Promise.all([
            // Query 1: Get the exact count
            connectionRequestModel.countDocuments(matchCondition),
            
            connectionRequestModel.aggregate([
                // STAGE 1: Find all accepted requests involving the logged-in user
                {
                    $match: matchCondition
                },
                
                // STAGE 2: THE MAGIC STAGE (If/Else inside the database)
                // Create a virtual field called 'friendId'
                {
                    $addFields: {
                        friendId: {
                            $cond: {
                                // IF fromUserId == logged-in user...
                                if: { $eq: ["$fromUserId", loggedInUser._id] }, 
                                // THEN the friend is toUserId
                                then: "$toUserId", 
                                // ELSE the friend is fromUserId
                                else: "$fromUserId" 
                            }
                        }
                    }
                },
                
                // STAGE 3: Join the Users collection using our new dynamic 'friendId'
                {
                    $lookup: {
                        from: "users",          // The actual MongoDB collection name
                        localField: "friendId", // The dynamic field we just created
                        foreignField: "_id",    // Match it to the User's _id
                        as: "friendProfile"     // Store the result in this array
                    }
                },
                
                // STAGE 4: $lookup returns an array. $unwind turns it into a normal object.
                {
                    $unwind: "$friendProfile"
                },
                
                // STAGE 5: Clean up the final output to send to the Angular frontend
                {
                    $project: {
                        // Only send exactly what the frontend needs
                        // _id: "$friendProfile._id",
                        // firstName: "$friendProfile.firstName",
                        // lastName: "$friendProfile.lastName",
                        // photoUrl: "$friendProfile.photoUrl"

                        // Send everything except password field
                        fromUserId: 0,
                        toUserId: 0,
                        status: 0,
                        createdAt: 0,
                        __v: 0,
                        friendProfile: {
                            password: 0,
                            createdAt: 0,
                            updatedAt: 0,
                            __v: 0
                        }
                    }
                },

                // STAGE 6: Pagination work
                { $skip: skip },
                { $limit: limit }
            ])
        ])

        res.send({
            success:true,
            message: "Connection requests fetched successfully",
            data: connections2,
            pagination: {
                totalItems,
                currentPage: Math.floor(skip / limit) + 1,
                totalPages: Math.ceil(totalItems / limit),
                hasMore: skip + connections2.length < totalItems
            }
        })
    } catch(error){
        next(error);
    }
})

// GET - Feed API
userRouter.get("/feed", async(req,res,next)=>{
    try{
        const loggedInUser = req.user;

        //pagination work
        const page = parseInt(req.query?.page) || 1;
        let limit = parseInt(req.query?.limit) || 10;
        limit = limit>50 ? 50 : limit;
        const skip = (page-1)*limit;

        const connectionRequests = await connectionRequestModel.find({
            $or:[
                {fromUserId: loggedInUser._id},
                {toUserId: loggedInUser._id}
            ]
        }).select("fromUserId toUserId");

        const hideUserFromFeed = new Set();
        connectionRequests.forEach((req)=>{
            hideUserFromFeed.add(req.fromUserId.toString());
            hideUserFromFeed.add(req.toUserId.toString());
        });
        hideUserFromFeed.add(loggedInUser._id.toString());
        // console.log(hideUserFromFeed)

        const filter = {_id: {$nin: Array.from(hideUserFromFeed)}};
        const [users, totalCount] = await Promise.all([
            UserModel.find(filter, {password:0, __v:0, createdAt:0, updatedAt:0})
                .select(USER_SAFE_DATA)
                .skip(skip) //skip documents for next pages 
                .limit(limit), //limit documents per page
            UserModel.countDocuments(filter)
        ]);

        // if(users.length === 0){
        //     // throw new AppError("No users found",404);
            
        //     // Depending on your framework, return a 200 OK with an empty array
        //     return res.status(200).json({
        //         success: true,
        //         data: [],
        //         message: "No more users found"
        //     });
        // }

        // pagination/scroll feature in the api {page:1, pageSize: 30, noOfPages:.., }
        // res.send({
        //     data: users,
        //     totalCount: users.length,
        //     success: true
        // });

        res.status(200).json({
            success: true,
            data: users,
            pagination: {
                totalItems: totalCount,
                currentPage: Math.floor(skip / limit) + 1,
                totalPages: Math.ceil(totalCount / limit),
                hasMore: skip + users.length < totalCount
            }
        });
    } catch (error) {
        next(error);
    }
});

// GET - /user/requests/received (with pagination)
// GET - /user/connections (with pagination)



module.exports = {userRouter};