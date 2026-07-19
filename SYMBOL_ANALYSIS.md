# Tabby AWS SSM SSH 플러그인 — 심볼 단위 분석

**프로젝트 성격**: Tabby 터미널의 플러그인으로, AWS SSM(Session Manager)을 통해 EC2 인스턴스에 SSH 접속하는 기능을 제공. TypeScript + Angular(15) 기반, `@aws-sdk/client-ssm`과 `ws`(WebSocket)로 SSM 스트림을 SSH 트래픽 터널로 감쌈.

구조는 `src/` 아래 6개 실질 소스 파일(`._`로 시작하는 파일은 macOS 리소스 포크 잔여 파일로 무시)로 구성되고, 각각 하나의 핵심 심볼을 중심으로 역할이 나뉩니다.

## 1. `src/index.ts` — 플러그인 진입점

```
Class TunnelSshModule (default export, @NgModule)
  - imports: CommonModule, FormsModule
  - declarations/exports: AwsSsmSshSettingsComponent, TunnelSshTabComponent
  - providers: { provide: ProfileProvider, useClass: AwsSsmSshProfileProvider, multi: true }
```

Angular 모듈로서 다른 4개 클래스를 전부 등록/연결하는 조립 지점.

## 2. `src/profiles.ts` — 프로필 정의/제공자

```
Interface AwsSsmSshProfile
  - options

Class AwsSsmSshProfileProvider extends ProfileProvider<AwsSsmSshProfile>  (@Injectable)
  - Property: id='aws-ssm-ssh', name='AWS SSM SSH', settingsComponent=AwsSsmSshSettingsComponent, configDefaults
  - Method getBuiltinProfiles()   → 템플릿 프로필 반환
  - Method getNewTabParameters()  → TunnelSshTabComponent를 새 탭 타입으로 지정
  - Method getDescription()       → "instanceId (region)" 형태 표시
```

Tabby의 `ProfileProvider` 확장점 구현체 — 여기서 `TunnelSshTabComponent`와 `AwsSsmSshSettingsComponent`를 서로 연결.

## 3. `src/components/awsSsmSshSettings.component.ts` — 설정 UI

```
Class AwsSsmSshSettingsComponent
  - Property: profile, awsProfiles
  - Method getAwsProfiles(), ngOnInit()
```

## 4. `src/components/tunnelSshTab.component.ts` — 탭 UI

```
Class TunnelSshTabComponent extends ConnectableTerminalTabComponent<AwsSsmSshProfile>
  - Property: session: TunnelSshSession | null, injector
  - Constructor
  - Method ngOnInit()
  - Method initializeSession() → new TunnelSshSession(this.injector, this.profile) 생성 후 setSession()
```

## 5. `src/session/tunnelSsh.session.ts` — 세션 로직 (핵심)

```
Class TunnelSshSession
  - Property: injector, profile, sshClient, shellChannel, tunnelStream, cols, rows
  - Constructor
  - Method start()                  → 세션 시작
  - Method createAwsSsmTunnel()     → new AwsSsmTunnelStream({...}) 생성 (SSM StartSession 결과로 터널 오픈)
  - Method write(), resize()
  - Method kill(), gracefullyKillProcess(), destroy()
  - Method supportsWorkingDirectory(), getWorkingDirectory()
```

`SSMClient`/`StartSessionCommand`(AWS SDK)로 세션을 열고, 그 결과를 `AwsSsmTunnelStream`에 넘겨 SSH 클라이언트(`ssh2`)와 연결하는 오케스트레이터.

## 6. `src/tunnel/awsSsm.tunnel.ts` — SSM 데이터채널 프로토콜 구현

```
Interface AgentMessage
  - messageType, messageId, sequenceNumber, flags, payloadType, payload

Interface AwsSsmTunnelOptions
  - streamUrl, tokenValue

Class AwsSsmTunnelStream  (Duplex 스트림)
  - Property: ws, options, sequenceNumber, isClosed
  - Constructor
  - Method connect()                → WebSocket 연결 (streamUrl/tokenValue)
  - Method encodeMessage()/decodeMessage() → SSM 에이전트 바이너리 메시지 프로토콜 인코딩/디코딩
  - Method generateUuidBytes()/parseUuid() → 메시지 UUID 처리
  - Method sendAck()                → ACK 프레임 전송
  - Method _read()/_write()/_destroy() → Node Duplex 스트림 구현 훅
```

AWS SSM 데이터 채널 WebSocket 프로토콜(바이너리 프레이밍)을 Node `Duplex` 스트림으로 감싸, 상위에서는 일반 스트림처럼 다루게 함.

## 심볼 간 관계 (참조 그래프)

```
TunnelSshModule (index.ts)
 ├─ registers → AwsSsmSshProfileProvider (profiles.ts)
 │                ├─ settingsComponent → AwsSsmSshSettingsComponent
 │                └─ getNewTabParameters() → TunnelSshTabComponent
 │
 ├─ declares → TunnelSshTabComponent (tunnelSshTab.component.ts)
 │                └─ initializeSession() → new TunnelSshSession(...)
 │                                            (session/tunnelSsh.session.ts)
 │
 └─ declares → AwsSsmSshSettingsComponent

TunnelSshSession
 └─ createAwsSsmTunnel() → new AwsSsmTunnelStream(...) (tunnel/awsSsm.tunnel.ts)
                              └─ Duplex 스트림 → sshClient(ssh2)와 파이핑
```

**흐름 요약**: `AwsSsmSshProfileProvider`가 프로필/설정 UI를 등록 → 사용자가 탭을 열면 `TunnelSshTabComponent`가 `TunnelSshSession`을 생성 → `TunnelSshSession`이 AWS SSM `StartSession` API 호출 후 그 결과로 `AwsSsmTunnelStream`(WebSocket 기반 Duplex)을 만들어 `ssh2` 클라이언트에 연결하는 구조입니다.
