
import os

file_path = r'c:\Users\jhona\CascadeProjects\Fastsavorys\pages\fast.html'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Adjust for 0-index and delete range
# Range to delete: 5526 to 6227 (inclusive, 1-based)
skip_range_start = 5526 - 1
skip_range_end = 6227 - 1

new_lines = []
header_inserted = False
banner_init_fixed = False
deleted_count = 0

for i, line in enumerate(lines):
    # Check deletion range
    if skip_range_start <= i <= skip_range_end:
        deleted_count += 1
        continue
    
    # 1. Header Insertion
    if '<script src="../assets/js/services.js"></script>' in line and not header_inserted:
        new_lines.append(line)
        new_lines.append('  <script src="../assets/js/fast/ad-banner.js"></script>\n')
        header_inserted = True
        continue

    # 2. Banner Init Fix
    if 'BannerModule.init();' in line and not banner_init_fixed:
        new_lines.append('      if (window.AdBannerModule) window.AdBannerModule.init();\n')
        banner_init_fixed = True
        continue

    new_lines.append(line)

print(f"Deleted {deleted_count} lines.")
print(f"Header inserted: {header_inserted}")
print(f"Banner fixed: {banner_init_fixed}")

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
