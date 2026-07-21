tabby-aws-ssm-ssh documentation
===============================

A `Tabby <https://tabby.sh>`_ terminal plugin that connects to EC2 instances
through **AWS Systems Manager (SSM) Session Manager** — no public IP, no open
inbound ports, and optionally no SSH key pair at all.

Two connection modes are supported:

- **AWS SSM Session** — opens a shell directly through the SSM Agent using
  only IAM permissions. No SSH key pair or ``sshd`` required on the instance.
- **SSH over SSM** — tunnels port 22 through SSM (``AWS-StartSSHSession``) and
  authenticates with a real SSH key pair, just like a normal SSH connection,
  but without the instance ever needing a public IP or an open security group
  inbound rule.

AWS credentials can come from a named AWS CLI profile, a static access
key/secret, or a `tabby-ssh-keepass <https://github.com/search5/tabby-ssh-keepass>`_
entry — see :doc:`prerequisites` and :doc:`usage` for the full picture.

.. toctree::
   :maxdepth: 2
   :caption: Contents:

   prerequisites
   installation
   usage
   architecture
   troubleshooting
