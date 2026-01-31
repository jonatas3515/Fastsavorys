import os

file_path = 'pages/fast.html'

def cleanup_remnants():
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    new_lines = []
    
    # Range 1: Block from 2835 to 3537 (approx)
    # Search for start: "async function uploadImageToStorage(file)" or close to it
    # Search for end: "const FlavorSelectionUI = {" ... down to "};" before "MINI-SALGADOS MODAL"
    
    # We will exclude lines by content markers to be robust
    
    start_marker = "async function uploadImageToStorage(file)"
    # End marker is BEFORE "function openMiniSalgadosModal"
    end_marker = "function openMiniSalgadosModal"
    
    skip_mode = False
    
    for i, line in enumerate(lines):
        content = line.strip()
        
        # 1. Remove Back to Admin Buttons
        if 'id="backToAdminBtn"' in content or 'id="backToAdminBtnMobile"' in content:
            continue
            
        # 2. Block Removal
        if start_marker in content:
            skip_mode = True
            # We skip this line and subsequent ones
        
        if skip_mode:
            # Check if we reached the end of the block (start of Public Mini Modal)
            if end_marker in content:
                skip_mode = False
                # We KEEP the end_marker line (it's public)
                new_lines.append(line)
            continue
            
        new_lines.append(line)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)

    print(f"Processed {len(lines)} lines -> {len(new_lines)} lines.")

if __name__ == "__main__":
    cleanup_remnants()
