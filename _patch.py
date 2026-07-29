import sys
filepath = "/Users/carlostah/Kiro/VSPRO/vspro/apps/web/src/app/(dashboard)/deliveries/page.tsx"
with open(filepath, "r") as f:
 lines = f.readlines()
print(f"Total lines: {len(lines)}")
print(f"Line 46: {repr(lines[45])}")
