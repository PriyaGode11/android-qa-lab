"""Turns Playwright's JUnit report into a Markdown table for the GitHub run page.

Usage: python3 scripts/summary.py test-results/junit.xml >> "$GITHUB_STEP_SUMMARY"
"""
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict

path = sys.argv[1] if len(sys.argv) > 1 else "test-results/junit.xml"
try:
    root = ET.parse(path).getroot()
except (OSError, ET.ParseError) as e:
    print(f"## Mobile web regression\n\nNo test report found ({e}).")
    sys.exit(0)

totals = defaultdict(lambda: {"passed": 0, "failed": 0, "skipped": 0})
failures = []

for suite in root.iter("testsuite"):
    device = suite.get("hostname") or "unknown"
    for case in suite.iter("testcase"):
        name = case.get("name", "")
        if case.find("failure") is not None or case.find("error") is not None:
            totals[device]["failed"] += 1
            failures.append(f"| {device} | {suite.get('name')} | {name} |")
        elif case.find("skipped") is not None:
            totals[device]["skipped"] += 1
        else:
            totals[device]["passed"] += 1

all_failed = sum(t["failed"] for t in totals.values())
all_passed = sum(t["passed"] for t in totals.values())
status = "✅ All tests passed" if all_failed == 0 else f"❌ {all_failed} failed"

print(f"## Mobile web regression: {status}\n")
print("| Device | Passed | Failed | Skipped |")
print("|---|---|---|---|")
for device in sorted(totals):
    t = totals[device]
    icon = "✅" if t["failed"] == 0 else "❌"
    print(f"| {icon} {device} | {t['passed']} | {t['failed']} | {t['skipped']} |")
print(f"| **Total** | **{all_passed}** | **{all_failed}** | "
      f"**{sum(t['skipped'] for t in totals.values())}** |\n")

if failures:
    print("### Failed tests\n")
    print("| Device | File | Test |\n|---|---|---|")
    print("\n".join(failures))
    print("\nDownload the **playwright-report** artifact and open `index.html` "
          "for screenshots, videos and step-by-step traces.")
