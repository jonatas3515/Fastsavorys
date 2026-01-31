import re

with open('assets/js/services.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove 4-space leading indentation from lines after the log marker
marker = "console.log('[Services] Módulo carregado com sucesso');"
idx = content.find(marker)
if idx > 0:
    before = content[:idx + len(marker)]
    after = content[idx + len(marker):]
    # Remove 4-space indent from each line in 'after'
    lines = after.split('\n')
    fixed_lines = []
    for line in lines:
        if line.startswith('    '):
            fixed_lines.append(line[4:])
        else:
            fixed_lines.append(line)
    fixed_after = '\n'.join(fixed_lines)
    new_content = before + fixed_after
    with open('assets/js/services.js', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('Fixed indentation in services.js')
else:
    print('Marker not found')
