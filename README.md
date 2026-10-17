RS Contas — Deploy no PythonAnywhere

Resumo rápido
- App web com frontend estático (`index.html`, `js/`, `css/`) e backend em Flask (`app.py`).
- Banco local SQLite em `data/rscontas.db`.

Passos (resumido) para subir no PythonAnywhere
1. Faça upload do projeto para sua conta (via Git clone ou upload dos arquivos) em `/home/<seu_usuario>/rsContas`.
2. Crie um virtualenv (recomendo o Python 3.11+):

```bash
cd ~/RSContas
python3 -m venv .venv
source .venv/bin/activate  # no Linux / Bash
pip install -r requirements.txt
```

3. No painel do PythonAnywhere → Web → Create a new web app → Manual config → escolha a versão do Python.
4. Aponte o "Source directory" para `/home/<seu_usuario>/RSContas`.
5. Edite o arquivo WSGI (WSGI configuration file) no dashboard e faça o import:

```python
from wsgi import application
```

(normalmente o arquivo é `/var/www/<seu_usuario>_pythonanywhere_com_wsgi.py` — substitua o conteúdo de import se necessário).

6. Configure static files (opcional): no Web tab, adicione mapeamentos se quiser que PythonAnywhere entregue `js/` e `css/` diretamente, por exemplo:
- URL: `/js/` -> Directory: `/home/<seu_usuario>/RSContas/js`
- URL: `/css/` -> Directory: `/home/<seu_usuario>/RSContas/css`

7. Clique em "Reload" para reiniciar o app.

Configurações úteis
- Banco: `data/rscontas.db` será criado automaticamente se não existir; garanta permissão de escrita na pasta.
- Variáveis de ambiente: defina no Web → Environment variables se precisar (por exemplo, `FLASK_ENV=production`).

Rodar localmente (teste rápido)
```bash
# dentro do repositório e com venv ativo
python app.py
# acessar http://127.0.0.1:5000
```

Notas
- `app.py` já exporta a variável `app` e `wsgi.py` expõe `application`, compatível com WSGI.
- Se preferir usar `gunicorn` em outro host, instale e rode `gunicorn wsgi:application`.
