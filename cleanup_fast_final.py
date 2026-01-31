
import os

file_path = r'c:\Users\jhona\CascadeProjects\Fastsavorys\pages\fast.html'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Adjust for 0-index and delete range
# Range to delete: 5503 to 5525 (inclusive, 1-based)
skip_range_start = 5503 - 1
skip_range_end = 5525 - 1

new_lines = []
deleted_count = 0

for i, line in enumerate(lines):
    # Check deletion range
    if skip_range_start <= i <= skip_range_end:
        deleted_count += 1
        continue
    
    new_lines.append(line)

print(f"Deleted {deleted_count} lines.")

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
