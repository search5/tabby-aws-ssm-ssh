Installation
============

There are two ways to install **tabby-aws-ssm-ssh**.

Method 1 — Install from the Tabby Plugin Manager
--------------------------------------------------

This is the recommended method for most users.

1. Open Tabby and go to **Settings → Plugins**.
2. In the search box, search for ``aws-ssm-ssh``.
3. Click **Install**, then restart Tabby when prompted.

Method 2 — Clone the Git repository and build from source
-----------------------------------------------------------

1. Clone the repository and move into it:

   .. code-block:: bash

      git clone https://github.com/search5/tabby-aws-ssm-ssh.git
      cd tabby-aws-ssm-ssh

2. Install the npm dependencies:

   .. code-block:: bash

      npm install

3. Build the plugin:

   .. code-block:: bash

      npm run build

4. Copy the built plugin into Tabby's plugin directory:

   .. code-block:: bash

      npm run install-plugin

   ``npm run install-plugin`` copies the ``dist/`` output into Tabby's
   plugin directory:

   - Linux: ``~/.config/tabby/plugins``
   - macOS: ``~/Library/Application Support/tabby/plugins``
   - Windows: ``%APPDATA%\tabby\plugins``

5. Restart Tabby so it picks up the newly installed plugin.

Development workflow
---------------------

If you are iterating on the plugin itself rather than just installing it,
use the watch build instead of a one-off ``npm run build``:

.. code-block:: bash

   npm run watch          # rebuild automatically on every source change
   npm run install-plugin # copy dist/ into Tabby's plugin directory

Remember to restart Tabby (or reload its window) after each
``install-plugin`` run to pick up the new build.
