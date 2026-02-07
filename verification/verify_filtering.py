from playwright.sync_api import sync_playwright
import time

def run(page):
    print("Navigating to app...")
    page.goto("http://localhost:5173")
    print("Waiting for table...")
    page.wait_for_selector("table", timeout=30000)

    print("Waiting for flows...")
    # Wait for at least one row
    page.wait_for_selector('tr[data-flow-id]', timeout=30000)

    print("Taking initial screenshot...")
    page.screenshot(path="verification/flows_initial.png")

    print("Filtering for 'John'...")
    page.get_by_placeholder("Filter flows...").fill("John")

    print("Waiting for filter update...")
    time.sleep(2) # Wait for debounce (300ms) + network

    print("Taking filtered screenshot...")
    page.screenshot(path="verification/flows_filtered.png")
    print("Done.")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            run(page)
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()
