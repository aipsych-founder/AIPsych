# agent_worker.py
import asyncio
from dotenv import load_dotenv
from livekit.agents import AgentSession, Agent, JobContext, WorkerOptions, cli, AutoSubscribe
from livekit.plugins import openai, silero

load_dotenv()

SYSTEM_PROMPT = """You are CalmSupport, a voice-based emotional support assistant. 
Listen compassionately, validate feelings, and offer brief, gentle coping suggestions. 
You are not a doctor — do not diagnose or prescribe. If imminent danger is expressed, escalate per protocol."""

async def entrypoint(ctx: JobContext):
    # Connect worker runtime
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    # Plugin instances (OpenAI for STT/LLM/TTS)
    stt = openai.STT()
    llm = openai.LLM()
    tts = openai.TTS()

    # optional local VAD
    try:
        vad = silero.VAD.load()
    except Exception:
        vad = None

    session = AgentSession(stt=stt, llm=llm, tts=tts, vad=vad)
    agent = Agent(instructions=SYSTEM_PROMPT)

    await session.start(room=ctx.room, agent=agent)
    print("Agent session started in room:", getattr(ctx.room, "name", "unknown"))

    try:
        while True:
            await asyncio.sleep(1)
    except asyncio.CancelledError:
        await session.stop()

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
