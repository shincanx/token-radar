"""Take the three token-radar screenshots with the stock Playwright Chromium.

Serves the entry's out/ dir on localhost, opens the dashboard in its three
states (board, a protocol detail, a filtered board) at 1440x900, and saves
PNGs to /tmp for sizing before they go into entry/screenshots/.
"""
import json
import subprocess
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

ENTRY = "/home/hatch/workspace/makefun/token-radar-01/entry"
OUT = f"{ENTRY}/out"
CHROME = "/home/hatch/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome"
PORT = 8471
BASE = f"http://127.0.0.1:{PORT}"

shots = [
    ("1-board.png", "/dashboard/index.html", None),
    ("2-detail.png", "/dashboard/index.html?detail=opentrade", "#detail"),
    ("3-filtered.png", "/dashboard/index.html?verdict=Farm", None),
]

server = subprocess.Popen(
    [sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"],
    cwd=OUT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)
try:
    for _ in range(30):
        try:
            urllib.request.urlopen(BASE + "/dashboard/index.html", timeout=2)
            break
        except Exception:
            time.sleep(0.5)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        for name, query, scroll_to in shots:
            page.goto(BASE + query, timeout=60000)
            page.wait_for_timeout(1200)
            if scroll_to:
                page.evaluate("window.scrollTo(0, document.querySelector('#detail').getBoundingClientRect().top + window.scrollY)")
                print("scrollY:", page.evaluate("window.scrollY"))
                page.wait_for_timeout(400)
            out = f"/tmp/{name}"
            page.screenshot(path=out)
            print("saved", out)
        browser.close()
finally:
    server.terminate()
