Prerequisites
=============

Before installing **tabby-aws-ssm-ssh**, make sure the following pieces are
in place. Most connection problems documented in :doc:`troubleshooting` trace
back to one of these items being missing.

Tabby itself
------------

- The `Tabby <https://tabby.sh>`_ desktop application must already be
  installed. This plugin extends Tabby; it is not a standalone application.

EC2 instance side
------------------

- The target EC2 instance must have the **SSM Agent** running and registered
  with AWS Systems Manager. This is true by default on modern Amazon Linux,
  Ubuntu, and Windows AMIs.
- The instance needs an **IAM instance profile** attached, with a policy that
  grants at least the ``AmazonSSMManagedInstanceCore`` managed policy.
- If the instance has **no public IP and no NAT gateway**, its VPC needs
  interface (PrivateLink) endpoints for:

  - ``com.amazonaws.<region>.ssm``
  - ``com.amazonaws.<region>.ssmmessages``
  - ``com.amazonaws.<region>.ec2messages``

  Without these endpoints, the SSM Agent on a private instance has no way to
  reach the Systems Manager service.

IAM permissions (client side)
------------------------------

The IAM principal used by the plugin (an AWS CLI profile, static access key,
or KeePass-stored credentials) needs, at minimum:

- ``ssm:StartSession`` on the target instance, for **AWS SSM Session** mode.
- Permission to start the ``AWS-StartSSHSession`` SSM document, additionally,
  for **SSH over SSM** mode.

SSH-over-SSM specific requirements
-----------------------------------

When using the **SSH over SSM** connection type, the target instance
additionally needs:

- ``sshd`` running on the instance.
- The corresponding **public key** placed in ``~/.ssh/authorized_keys`` for
  the login user you intend to connect as.

Optional: KeePass integration
-------------------------------

If you plan to retrieve AWS credentials and/or the SSH private key from a
KeePass database instead of entering them manually, the
`tabby-ssh-keepass <https://github.com/search5/tabby-ssh-keepass>`_ plugin
must also be installed and configured in Tabby. See :doc:`usage` for how
entries are looked up.
