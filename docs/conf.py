# Configuration file for the Sphinx documentation builder.
#
# For the full list of built-in configuration values, see the documentation:
# https://www.sphinx-doc.org/en/master/usage/configuration.html

# -- Project information -----------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#project-information

project = 'tabby-aws-ssm-ssh'
copyright = '2026, search5'
author = 'search5'

version = '1.0.0'
release = '1.0.0'

# -- General configuration ---------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#general-configuration

extensions = []

templates_path = ['_templates']
exclude_patterns = ['_build', 'Thumbs.db', '.DS_Store']

# -- Internationalization ------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/advanced/intl.html

language = 'en'
locale_dirs = ['locale/']
gettext_compact = False

# -- Options for HTML output -------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#options-for-html-output

html_theme = 'sphinx_book_theme'
html_static_path = ['_static']
html_templates_path = ['_templates']

html_theme_options = {
    "repository_url": "https://github.com/search5/tabby-aws-ssm-ssh",
    "use_repository_button": True,
    "use_issues_button": True,
    "use_edit_page_button": False,
    "navbar_end": ["version-switcher"],
    "switcher": {
        "json_url": "_static/switcher.json",
        "version_match": "en",
    },
}

# -- Options for EPUB output --------------------------------------------------

epub_title = project
epub_author = author
epub_publisher = author
epub_copyright = copyright
epub_exclude_files = ['search.html', '_static/switcher.json']


# -- Dynamic per-language titles (HTML tab title & EPUB title) ---------------
# See SPHINX_MULTILINGUAL_DOCS_RECIPE.md section 4.

def setup(app):
    def update_language_titles(app, config):
        app.config.html_theme_options["switcher"]["version_match"] = config.language
        if config.language == 'ko':
            app.config.html_title = f"{project} 문서 (한국어)"
            app.config.epub_title = f"{project} (한국어)"
        else:
            app.config.html_title = f"{project} Documentation (EN)"
            app.config.epub_title = f"{project} (English)"
    app.connect("config-inited", update_language_titles)
