import os

# Nome do ficheiro de saída
output_file = 'backend_completo.txt'

# Extensões que queremos ler (ajuste conforme necessário)
extensions = ('.js', '.py', '.ts', '.php', '.html', '.css', '.json', '.sql')

with open(output_file, 'w', encoding='utf-8') as outfile:
    # Percorre todos os ficheiros da pasta atual e subpastas
    for root, dirs, files in os.walk("."):
        # Ignorar pastas indesejadas (node_modules, .git, etc)
        if 'node_modules' in root or '.git' in root or '__pycache__' in root:
            continue
            
        for file in files:
            if file.endswith(extensions) and file != 'juntar.py':
                path = os.path.join(root, file)
                try:
                    with open(path, 'r', encoding='utf-8') as infile:
                        # Escreve um cabeçalho para eu saber onde começa cada ficheiro
                        outfile.write(f"\n{'='*50}\n")
                        outfile.write(f"START FILE: {path}\n")
                        outfile.write(f"{'='*50}\n\n")
                        outfile.write(infile.read())
                        outfile.write("\n")
                except Exception as e:
                    print(f"Erro ao ler {file}: {e}")

print(f"Sucesso! Envie o ficheiro '{output_file}' no chat.")