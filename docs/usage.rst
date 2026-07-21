Usage
=====

Creating a connection
----------------------

In Tabby, create a new connection and choose the connection type
**AWS SSM SSH**. Fill in the fields described below.

Connection profile fields
---------------------------

.. list-table::
   :header-rows: 1
   :widths: 25 75

   * - Field
     - Description
   * - AWS Region
     - Region the instance lives in, e.g. ``ap-northeast-2``.
   * - Instance ID
     - The EC2 instance ID, e.g. ``i-xxxxxxxxxxxxxxxxx``.
   * - Connection Type
     - ``AWS SSM Session`` (no key needed) or ``SSH over SSM`` (key pair
       required).
   * - Username
     - Login user for **SSH over SSM** mode, e.g. ``ec2-user``.
   * - AWS Connection Auth
     - ``Use AWS Profile``, ``Static Access Key / Secret``, or
       ``Retrieve from KeePass``.
   * - SSH Auth Method *(SSH-over-SSM only)*
     - ``Manual Input / Private Key Path`` (or Vault) or
       ``Retrieve from KeePass``.

Choosing a connection type
-----------------------------

**AWS SSM Session**
   Opens a shell directly through the SSM Agent using only IAM permissions.
   No SSH key pair or ``sshd`` is required on the instance. This is the
   simplest mode and the recommended default when you just need a shell.

**SSH over SSM**
   Tunnels port 22 through SSM (using the ``AWS-StartSSHSession`` document)
   and authenticates with a real SSH key pair, exactly like a normal SSH
   connection — except the instance never needs a public IP or an open
   security group inbound rule. Use this mode when you need SSH-specific
   features (for example, SFTP, port forwarding, or agent forwarding) that
   depend on an actual SSH session rather than a bare SSM shell.

AWS credential options
-------------------------

The plugin supports three ways to supply AWS credentials
(**AWS Connection Auth**):

- **Use AWS Profile** — a named profile from ``~/.aws/config`` /
  ``~/.aws/credentials``, including profiles that use
  ``credential_process``.
- **Static Access Key / Secret** — an access key ID and secret access key
  entered directly.
- **Retrieve from KeePass** — credentials looked up from a KeePass entry (see
  below).

SSH credential options (SSH-over-SSM mode only)
--------------------------------------------------

- **Manual Input / Private Key Path** — a private key file path, or a key
  stored in Tabby's Vault.
- **Retrieve from KeePass** — a key attached to a KeePass entry (see below).

KeePass lookup
-----------------

KeePass-backed credentials require the
`tabby-ssh-keepass <https://github.com/search5/tabby-ssh-keepass>`_ plugin to
be installed and configured (see :doc:`prerequisites`).

When ``Retrieve from KeePass`` is selected for either AWS or SSH
credentials, the plugin looks up a KeePass entry as follows:

1. It searches for an entry whose **URL** field is ``ssh://<instanceId>``.
2. If no entry has a matching URL, it falls back to an entry whose **Title**
   matches the instance ID.

From the matched entry:

- AWS access key and secret are read from the custom fields
  ``AWS Access ID`` and ``AWS Secret Key``.
- The SSH private key is read from a file attached to the entry.

.. tip::

   Keep one KeePass entry per instance, named (or tagged via its URL field)
   after the instance ID, and store both the AWS credential fields and the
   attached private key on that same entry — this lets a single entry serve
   both the AWS SSM Session and SSH-over-SSM lookups described above.
