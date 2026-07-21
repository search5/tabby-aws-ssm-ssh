Troubleshooting & FAQ
======================

Most connection failures trace back to one of the requirements listed in
:doc:`prerequisites`. This page walks through the symptoms you are likely to
see for each missing piece, and how to fix them.

"TargetNotConnected" / session fails to start
-------------------------------------------------

**Symptom:** the connection fails immediately with an error resembling
``TargetNotConnected`` or "instance is not connected to SSM".

**Cause:** the SSM Agent on the target instance is not running, or is not
registered with Systems Manager.

**Fix:**

- Confirm the instance appears as *Managed* in the AWS Console under
  *Systems Manager → Fleet Manager*. If it does not appear there, the SSM
  Agent has not registered.
- Check that the SSM Agent service is running on the instance
  (``sudo systemctl status amazon-ssm-agent`` on Linux).
- Confirm the instance has an **IAM instance profile** attached with a
  policy that includes ``AmazonSSMManagedInstanceCore``. A missing or
  incorrect instance profile is the most common cause of an unregistered
  agent.

"AccessDeniedException" when starting a session
-----------------------------------------------------

**Symptom:** the plugin reports an access-denied error from the AWS API
when attempting to connect.

**Cause:** the IAM principal used by the plugin (profile, static keys, or
KeePass-stored credentials) lacks the permissions needed to start a
session.

**Fix:**

- Ensure the principal has ``ssm:StartSession`` on the target instance
  (directly or via a resource-tag condition that matches the instance).
- For **SSH over SSM** connections specifically, also ensure the principal
  is allowed to start the ``AWS-StartSSHSession`` document — a policy that
  only allows the default SSM shell document will not be enough here.

Connection hangs or times out on a private instance
--------------------------------------------------------

**Symptom:** the session never establishes, or times out, specifically for
instances that have no public IP.

**Cause:** the instance has no public IP and no NAT gateway, and the VPC is
missing the interface endpoints the SSM Agent needs to reach the Systems
Manager service.

**Fix:** create VPC interface endpoints for all three of:

- ``com.amazonaws.<region>.ssm``
- ``com.amazonaws.<region>.ssmmessages``
- ``com.amazonaws.<region>.ec2messages``

All three are required together; having only one or two configured will
still leave the agent unable to fully communicate.

SSH-over-SSM connects but authentication fails
----------------------------------------------------

**Symptom:** the SSM tunnel opens (you can tell because the connection
attempt gets further than an immediate failure), but the SSH handshake or
authentication fails.

**Cause:** one of the SSH-specific prerequisites is not satisfied — these
are separate from the SSM-level requirements above.

**Fix:**

- Confirm ``sshd`` is actually running on the instance.
- Confirm the corresponding **public key** is present in
  ``~/.ssh/authorized_keys`` for the login user you specified in the
  connection profile's **Username** field.
- Double check the **Username** field matches the account the key is
  authorized for (for example ``ec2-user`` vs ``ubuntu`` vs ``admin``,
  depending on the AMI).
- If using a manually entered private key path, confirm the path is correct
  and readable by Tabby, and that its permissions are restrictive enough
  for ``sshd`` on the *server* side to accept the matching public key (this
  is a server-side ``authorized_keys`` concern, not a client-side one, but
  key mismatches are easy to introduce when copy-pasting keys).

KeePass entry not found / wrong credentials retrieved
------------------------------------------------------------

**Symptom:** choosing ``Retrieve from KeePass`` for AWS or SSH credentials
results in an error saying no matching entry was found, or the wrong
credentials get used.

**Cause:** the plugin's KeePass lookup is based on a specific matching
rule (see :doc:`usage`), and the entry does not match it.

**Fix:**

- Make sure the `tabby-ssh-keepass <https://github.com/search5/tabby-ssh-keepass>`_
  plugin is installed and configured — KeePass-backed credentials do not
  work without it (see :doc:`prerequisites`).
- Set the KeePass entry's **URL** field to exactly ``ssh://<instanceId>``
  (replace ``<instanceId>`` with the actual instance ID from the
  connection profile). If several entries could match the same instance,
  the URL-based lookup takes priority over the title-based fallback.
- If you are relying on the title-based fallback instead of the URL field,
  make sure the entry's **Title** is exactly the instance ID, not a
  human-friendly nickname.
- For AWS credentials, confirm the custom fields are named exactly
  ``AWS Access ID`` and ``AWS Secret Key`` (case and spacing matter).
- For SSH keys, confirm the private key is attached to the entry as a file
  attachment, not pasted into a text field.

AWS profile credentials aren't picked up
----------------------------------------------

**Symptom:** ``Use AWS Profile`` is selected, but the connection fails with
a credentials error.

**Cause:** the named profile is missing, misspelled, or its
``credential_process`` (if used) is failing silently.

**Fix:**

- Confirm the profile name matches an entry in ``~/.aws/config`` or
  ``~/.aws/credentials`` exactly.
- If the profile uses ``credential_process``, try running that command
  manually in a terminal to confirm it succeeds and prints valid JSON
  credentials.
- Confirm the machine running Tabby has network access to any identity
  provider the ``credential_process`` depends on (for example, an SSO
  portal or a corporate credential broker).
