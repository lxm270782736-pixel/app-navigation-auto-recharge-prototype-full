"""
Navigation App — root entry point.

Usage:
    python main.py
"""
import uvicorn

if __name__ == "__main__":
    uvicorn.run("src.main:app", host="0.0.0.0", port=8080)
