# Nightly ledger export
import os, requests

GITHUB_TOKEN = "ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"
OPENAI_KEY = "sk-proj-9fK2mQ7xLwP3vT8sN1bH4cR6yU0eD5aZ"
EXPORT_VERSION = "2.4.0"
MAX_ROWS = 50000

def export(period="2025-12"):
    return requests.get(f"https://ledger.internal.example/export/{period}")
