Architecture
============

**tabby-aws-ssm-ssh** is an Angular-based Tabby plugin, written in
TypeScript. It uses ``@aws-sdk/client-ssm`` to start SSM sessions and a raw
WebSocket (``ws``) to speak the SSM Agent's binary data-channel protocol,
optionally wrapping that channel with an ``ssh2`` client for the
SSH-over-SSM mode.

The source tree has six files under ``src/``, each centered on one core
symbol:

.. list-table::
   :header-rows: 1
   :widths: 35 65

   * - File
     - Responsibility
   * - ``src/index.ts``
     - Plugin entry point — an Angular ``@NgModule`` (``TunnelSshModule``)
       that registers the other components and the profile provider.
   * - ``src/profiles.ts``
     - Defines the ``AwsSsmSshProfile`` connection-profile shape and
       ``AwsSsmSshProfileProvider``, Tabby's extension point for adding a
       new connection type.
   * - ``src/components/awsSsmSshSettings.component.ts``
     - The connection settings UI (region, instance ID, credential
       options, etc. — see :doc:`usage`).
   * - ``src/components/tunnelSshTab.component.ts``
     - The terminal tab UI; creates and owns a ``TunnelSshSession`` for
       each opened tab.
   * - ``src/session/tunnelSsh.session.ts``
     - Session orchestration — calls the AWS SSM ``StartSession`` API and
       wires the resulting stream into an SSH client when needed.
   * - ``src/tunnel/awsSsm.tunnel.ts``
     - Implements the SSM Agent's binary WebSocket data-channel protocol as
       a Node.js ``Duplex`` stream.

Component relationships
--------------------------

.. code-block:: text

   TunnelSshModule (index.ts)
    |
    +-- registers --> AwsSsmSshProfileProvider (profiles.ts)
    |                    |-- settingsComponent --> AwsSsmSshSettingsComponent
    |                    `-- getNewTabParameters() --> TunnelSshTabComponent
    |
    +-- declares --> TunnelSshTabComponent (tunnelSshTab.component.ts)
    |                    `-- initializeSession() --> new TunnelSshSession(...)
    |                                                 (session/tunnelSsh.session.ts)
    |
    `-- declares --> AwsSsmSshSettingsComponent

   TunnelSshSession
    `-- createAwsSsmTunnel() --> new AwsSsmTunnelStream(...) (tunnel/awsSsm.tunnel.ts)
                                   `-- Duplex stream <--> ssh2 client (SSH-over-SSM mode)

Key classes
--------------

``AwsSsmSshProfileProvider`` (``src/profiles.ts``)
   Extends Tabby's ``ProfileProvider<AwsSsmSshProfile>``. Registers the
   profile type under id ``aws-ssm-ssh`` / display name ``AWS SSM SSH``,
   supplies built-in profile templates via ``getBuiltinProfiles()``, points
   new tabs at ``TunnelSshTabComponent`` via ``getNewTabParameters()``, and
   formats the profile's short description (``"instanceId (region)"``) via
   ``getDescription()``.

``TunnelSshTabComponent`` (``src/components/tunnelSshTab.component.ts``)
   Extends Tabby's ``ConnectableTerminalTabComponent<AwsSsmSshProfile>``.
   On initialization it builds a ``TunnelSshSession`` for the active
   profile and attaches it to the tab via ``setSession()``.

``TunnelSshSession`` (``src/session/tunnelSsh.session.ts``)
   The core orchestrator. ``start()`` kicks off the session; internally,
   ``createAwsSsmTunnel()`` calls the AWS SSM ``StartSessionCommand`` and
   feeds the resulting stream URL/token into a new ``AwsSsmTunnelStream``.
   For SSH-over-SSM profiles, that tunnel stream is piped into an ``ssh2``
   client instead of being treated as a raw shell. Exposes the usual
   terminal-tab lifecycle methods: ``write()``, ``resize()``, ``kill()``,
   ``gracefullyKillProcess()``, ``destroy()``.

``AwsSsmTunnelStream`` (``src/tunnel/awsSsm.tunnel.ts``)
   A Node.js ``Duplex`` stream wrapping a WebSocket connection to the SSM
   data channel. Implements the SSM Agent's binary framing directly:
   ``encodeMessage()`` / ``decodeMessage()`` handle the ``AgentMessage``
   frame format (message type, message ID, sequence number, flags, payload
   type, payload), ``generateUuidBytes()`` / ``parseUuid()`` handle the
   per-message UUIDs, and ``sendAck()`` emits the ACK frames the protocol
   requires. ``_read()`` / ``_write()`` / ``_destroy()`` implement the
   Duplex stream contract so the rest of the plugin can treat the tunnel
   like any other Node stream.

End-to-end flow
-------------------

1. ``AwsSsmSshProfileProvider`` registers the profile type and its settings
   UI with Tabby.
2. The user opens a tab for a saved profile; ``TunnelSshTabComponent``
   creates a ``TunnelSshSession``.
3. ``TunnelSshSession`` calls the AWS SSM ``StartSession`` API, obtaining a
   WebSocket stream URL and token.
4. Those are handed to ``AwsSsmTunnelStream``, which opens the WebSocket and
   speaks the SSM binary protocol, exposing itself as a Node ``Duplex``
   stream.
5. In **AWS SSM Session** mode, that Duplex stream *is* the terminal
   session. In **SSH over SSM** mode, the Duplex stream is instead piped
   into an ``ssh2`` client, which performs the SSH handshake and
   authentication over the tunnel, and the resulting SSH channel becomes
   the terminal session.
