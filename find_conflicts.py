import re

# Get all let/const/var declarations from products.js
with open('assets/js/products.js', 'r', encoding='utf-8') as f:
    products_content = f.read()

# Find all let/const/var variable names at the file scope level (no indentation or minimal)
pattern = r'^(?:let|const|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)'
products_vars = set(re.findall(pattern, products_content, re.MULTILINE))
print('Variables in products.js:', sorted(products_vars))

# Also check services.js for potential conflicts
with open('assets/js/services.js', 'r', encoding='utf-8') as f:
    services_content = f.read()
services_vars = set(re.findall(pattern, services_content, re.MULTILINE))
print('Variables in services.js:', sorted(services_vars))

# Combine
all_external_vars = products_vars | services_vars
print('All external JS variables:', sorted(all_external_vars))

# Now check which of these are also in fast.html (top-level script declarations)
with open('pages/fast.html', 'r', encoding='utf-8') as f:
    html_content = f.read()

conflicts = []
for var in all_external_vars:
    # Check for let/const/var declarations in fast.html
    if re.search(r'\b(let|const|var)\s+' + var + r'\s*[=;]', html_content):
        conflicts.append(var)

print('\\nConflicting variables found in fast.html:', sorted(conflicts))
print('\\nTotal conflicts:', len(conflicts))

# Find specific line numbers for each conflict
for var in sorted(conflicts):
    lines = html_content.split('\\n')
    for i, line in enumerate(lines):
        if re.search(r'\b(let|const|var)\s+' + var + r'\b', line):
            print(f'  Line {i+1}: {var} -> {line.strip()[:80]}')
