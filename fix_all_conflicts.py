import re

# Get all let/const/var declarations from products.js
with open('assets/js/products.js', 'r', encoding='utf-8') as f:
    products_content = f.read()

# Find all let/const/var variable names at the file scope level
pattern = r'^(?:let|const|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)'
products_vars = set(re.findall(pattern, products_content, re.MULTILINE))

# Check services.js too
with open('assets/js/services.js', 'r', encoding='utf-8') as f:
    services_content = f.read()
services_vars = set(re.findall(pattern, services_content, re.MULTILINE))

# Also check cart.js
try:
    with open('assets/js/cart.js', 'r', encoding='utf-8') as f:
        cart_content = f.read()
    cart_vars = set(re.findall(pattern, cart_content, re.MULTILINE))
except:
    cart_vars = set()

# Combine
all_external_vars = products_vars | services_vars | cart_vars
print(f'Total external JS variables: {len(all_external_vars)}')

# Now check which of these are also in fast.html
with open('pages/fast.html', 'r', encoding='utf-8') as f:
    html_lines = f.readlines()
    html_content = ''.join(html_lines)

conflicts = {}
for var in all_external_vars:
    for i, line in enumerate(html_lines):
        if re.search(r'\b(let|const|var)\s+' + var + r'\s*[=;]', line):
            conflicts[var] = i + 1

print(f'Conflicting variables in fast.html: {len(conflicts)}')
for var, line_num in sorted(conflicts.items(), key=lambda x: x[1]):
    print(f'  Line {line_num}: {var}')

# Now remove these lines from fast.html
print('\\nRemoving conflicting declarations...')
removed_count = 0
new_lines = []
for i, line in enumerate(html_lines):
    line_num = i + 1
    should_remove = False
    for var, conflict_line in conflicts.items():
        if line_num == conflict_line:
            if re.search(r'\b(let|const|var)\s+' + var + r'\s*[=;]', line):
                # Comment out the line instead of removing
                new_lines.append('    // CONFLICT REMOVED: ' + line.lstrip())
                should_remove = True
                removed_count += 1
                print(f'  Commented out line {line_num}: {var}')
                break
    if not should_remove:
        new_lines.append(line)

with open('pages/fast.html', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f'\\nDone! Commented out {removed_count} conflicting declarations.')
