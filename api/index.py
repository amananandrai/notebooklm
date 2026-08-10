# Entrypoint wrapper for Vercel Python runtime
import sys
import os

# Insert parent directory so mcp_server.py can be imported correctly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mcp_server import app
