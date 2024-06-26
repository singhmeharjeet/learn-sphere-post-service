const env = require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");

const admin = require("firebase-admin");

const credentials = require("./key.js");
const { v4: uuidv4 } = require("uuid");
const { getAuth } = require("./middleware.js");

const PORT = process.env.PORT || 8080;

admin.initializeApp({
	credential: admin.credential.cert(credentials.credentials),
});

const db = admin.firestore();

// Middleware--------------------------------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ------------------------------------------

app.get("/api/post-service/", (req, res) => {
	res.json({
		message: "Welcome to the Post Service of Learn Sphere!",
	});
});

app.use(getAuth);

// ---------------------------POST CREATE METHOD-------------------------

app.post("/api/post-service/posts/create", async (req, res) => {
	try {
		const { username, role } = res.locals.user;
		if (role !== "teacher") {
			return res.status(403).json({
				succes: false,
				message: "Unauthorized to create a post",
			});
		}

		const postJson = {
			postId: uuidv4(),
			createdAt: new Date(),
			comments: [],
			postedBy: username,
			image: req.body.image,
			description: req.body.description,
			lectureURL: req.body.lectureURL,
			title: req.body.title,
		};

		await db.collection("posts").doc(postJson.postId).set(postJson);

		return res.status(200).json({
			success: true,
			message: "Post created successfully",
			post: postJson,
		});
	} catch (error) {
		console.error("Error creating post:", error);
		return res
			.status(500)
			.json({ succes: false, message: "Internal Server Error" });
	}
});

// ----------------------------GET A POST USING POST ID METHOD------------------

app.get("/api/post-service/posts/:postId", async (req, res) => {
	try {
		const { postId } = req.params;
		const query_return = await db
			.collection("posts")
			.where("postId", "==", postId)
			.get();
		if (!query_return.empty) {
			const doc = query_return.docs[0];
			const postData = doc.data();
			return res
				.status(200)
				.json({ success: true, message: "Post found", post: postData });
		} else {
			console.log("No post found with PostID :", postId);
			return res
				.status(404)
				.json({ success: false, message: "Post not found" });
		}
	} catch (error) {
		console.error("Error fetching post:", error);
		return res
			.status(500)
			.json({ success: false, message: "Internal Server Error" });
	}
});

//----------------------------GET A POST USING USER ID------------------

app.get("/api/post-service/posts/user/:userId", async (req, res) => {
	try {
		const { userId } = req.params;

		const querySnapshot = await db
			.collection("posts")
			.where("postedBy", "==", userId)
			.get();
		const posts = querySnapshot.docs.map((doc) => doc.data());
		return res
			.status(200)
			.json({ success: true, message: "Posts found", post: posts });
	} catch (error) {
		console.error("Error fetching posts by userId:", error);
		return res
			.status(500)
			.json({ success: false, message: "Internal Server Error" });
	}
});

// ---------------------------------GETTING ALL POSTS THAT EXIST------------------------

app.get("/api/post-service/posts", async (req, res) => {
	try {
		const querySnapshot = await db.collection("posts").get();
		const posts = querySnapshot.docs.map((doc) => doc.data());
		return res.status(200).json({
			success: true,
			message: "Posts found",
			post: posts.sort(
				(a, b) =>
					new Date(b.createdAt._seconds * 1000) -
					new Date(a.createdAt._seconds * 1000)
			),
		});
	} catch (error) {
		console.error("Error fetching posts:", error);
		return res
			.status(500)
			.json({ success: false, message: "Internal Server Error" });
	}
});

// ------------------------------------DELETING A POST BASED ON POST ID-------------------------
app.delete("/api/post-service/posts/delete/:postId", async (req, res) => {
	try {
		const { postId } = req.params;
		const { username, role } = res.locals.user;

		const postRef = db.collection("posts").doc(postId);
		const postDoc = await postRef.get();

		if (!postDoc.exists) {
			return res
				.status(404)
				.json({ success: false, message: "Post not found" });
		}

		const postData = postDoc.data();

		if (role !== "admin" && username !== postData.postedBy) {
			return res.status(403).json({
				success: false,
				message: "Unauthorized to delete this post",
			});
		}

		await db.collection("posts").doc(postId).delete();

		return res
			.status(200)
			.json({ success: true, message: "Post deleted successfully" });
	} catch (error) {
		console.error("Error deleting post:", error);
		return res
			.status(500)
			.json({ success: false, message: "Internal Server Error" });
	}
});

// -------------------------------------UPDATING A POST BASED ON POST ID---------------------------
app.put("/api/post-service/posts/update/:postId", async (req, res) => {
	try {
		const { postId } = req.params;
		const { username, role } = res.locals.user;
		const { title, description, image, lectureURL } = req.body;

		const postRef = db.collection("posts").doc(postId);
		const postDoc = await postRef.get();

		if (!postDoc.exists) {
			return res
				.status(404)
				.json({ success: false, message: "Post not found" });
		}

		const postData = postDoc.data();

		if (role !== "admin" && username !== postData.postedBy) {
			//Permissions
			return res.status(403).json({
				success: false,
				message: "Unauthorized to update this post",
			});
		}

		const updatedPostData = {
			...postData,
			...{
				title,
				description,
				image,
				lectureURL,
			},
		};

		await postRef.update(updatedPostData);

		return res.status(200).json({
			success: true,
			message: "Post updated successfully",
			post: updatedPostData,
		});
	} catch (error) {
		console.error("Error updating post:", error);
		return res
			.status(500)
			.json({ success: false, message: "Internal Server Error" });
	}
});

//----------------------------------------COMMENT ON A POST--------------------------------------
app.post("/api/post-service/posts/:postId/addcomment", async (req, res) => {
	try {
		const { postId } = req.params;
		const { userId, comment } = req.body;

		const commentId = uuidv4();
		const newComment = {
			id: commentId,
			createdAt: new Date(),
			author: userId,
			comment: comment,
		};

		const postRef = db.collection("posts").doc(postId);
		const postDoc = await postRef.get();

		if (!postDoc.exists) {
			return res
				.status(404)
				.json({ success: false, message: "Post not found" });
		}

		const postData = postDoc.data();

		const comments = postData.comments || [];

		await postRef.update({ comments: [...comments, newComment] });

		return res.status(200).json({
			success: true,
			message: "Comment added successfully",
			comment: newComment,
		});
	} catch (error) {
		console.error("Error adding comment:", error);
		return res
			.status(500)
			.json({ success: false, message: "Internal Server Error" });
	}
});

//----------------------------------------DELETE A COMMENT--------------------------------------
app.delete(
	"/api/post-service/posts/:postId/comments/:commentId/delete",
	async (req, res) => {
		try {
			const { postId, commentId } = req.params;
			const { username, role } = res.locals.user;

			const postRef = db.collection("posts").doc(postId);
			const postDoc = await postRef.get();

			if (!postDoc.exists) {
				return res
					.status(404)
					.json({ success: false, message: "Post not found" });
			}

			const postData = postDoc.data();
			const comments = postData.comments || [];

			let commentPosition = -1;
			comments.forEach((comment, index) => {
				if (comment.id === commentId) {
					commentPosition = index;
				}
			});

			if (commentPosition === -1) {
				return res
					.status(404)
					.json({ success: false, message: "Comment not found" });
			}

			const comment = comments[commentPosition];

			if (
				role !== "admin" &&
				username !== comment.author &&
				username !== postData.postedBy
			) {
				return res.status(403).json({
					success: false,
					message: "Unauthorized to delete this comment",
				});
			}

			const updatedComments = comments.filter((c, index) => {
				if (index !== commentPosition) {
					return c;
				}
			});

			await postRef.update({ comments: updatedComments });

			console.log("Comment deleted on", postId, "Comment:", commentId);
			return res.status(200).json({
				success: true,
				message: "Comment deleted successfully",
			});
		} catch (error) {
			console.error("Error deleting comment:", error);
			return res
				.status(500)
				.json({ success: false, message: "Internal Server Error" });
		}
	}
);

app.listen(PORT, () => {
	console.log(`Post Service is listing on PORT ${PORT}...`);
});
