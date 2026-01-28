import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { AccessToken } from "livekit-server-sdk";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.post("/token", async (req, res) => {
  try {
    const { room = "default-room", identity = "guest" } = req.body;

    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      { identity }
    );

    at.addGrant({ room });

    const token = await at.toJwt();

    res.json({ token, wsUrl: process.env.LIVEKIT_URL });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Token generation failed" });
  }
});

app.listen(3002, () =>
  console.log("LiveKit token server running on port 3002")
);
