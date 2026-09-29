/**
 * Shared "AWTRIX panel" section of the property inspectors, plus the
 * "Claude Code listener" section on pages that have a #awtrix-listener element.
 *
 * The plugin owns the connection (global settings): this page sends the host
 * or port once ({ event: "setHost" } / { event: "setListenerPort" }) and shows
 * the status the plugin reports back ({ event: "status" }).
 */
(function () {
  const client = SDPIComponents.streamDeckClient;
  const $ = (id) => document.getElementById(id);

  const STATE_TEXT = {
    connected: "Connected",
    connecting: "Connecting…",
    error: "Connection problem",
    unconfigured: "No panel configured",
  };

  const LISTENER_TEXT = {
    listening: "Listening",
    stopped: "Stopped",
    error: "Listener problem",
  };

  let hostEdited = false;
  let portEdited = false;

  function send(payload) {
    client.send("sendToPlugin", payload);
  }

  function showMessage(id, text, kind) {
    const box = $(id);
    if (!box) {
      return;
    }
    box.textContent = text || "";
    box.className = `message ${kind || ""}`;
    box.hidden = !text;
  }

  function renderStatus(status) {
    const badge = $("awtrix-status");
    badge.className = `status ${status.state}`;
    $("awtrix-status-text").textContent = STATE_TEXT[status.state] || status.state;
    $("awtrix-status-detail").textContent = status.error
      ? `${status.host} · ${status.error}`
      : status.state === "connected"
        ? `${status.host} · AWTRIX ${status.version || "?"} · app: ${status.app || "–"}`
        : status.host;
    if (!hostEdited && !$("awtrix-host").value) {
      $("awtrix-host").value = status.host || "";
    }

    if ($("awtrix-listener-status")) {
      const state = status.listenerState;
      $("awtrix-listener-status").className = `status ${state === "listening" ? "connected" : state}`;
      $("awtrix-listener-text").textContent = LISTENER_TEXT[state] || state;
      $("awtrix-listener-detail").textContent = status.listenerError
        ? status.listenerError
        : `127.0.0.1:${status.listenerPort} · ${status.pending} pending`;
      if (!portEdited && !$("awtrix-port").value) {
        $("awtrix-port").value = String(status.listenerPort || "");
      }
    }
  }

  client.sendToPropertyInspector.subscribe((message) => {
    const payload = message.payload || {};
    switch (payload.event) {
      case "status":
        renderStatus(payload);
        break;
      case "testHost":
        $("awtrix-test").disabled = false;
        showMessage(
          "awtrix-message",
          payload.ok ? `Panel reachable (AWTRIX ${payload.version || "?"}, app: ${payload.app || "–"})` : payload.error,
          payload.ok ? "success" : "error",
        );
        break;
      case "setHost":
        $("awtrix-save").disabled = false;
        showMessage("awtrix-message", payload.ok ? "Saved, panel reachable" : `Saved, but: ${payload.error || "panel not reachable"}`, payload.ok ? "success" : "error");
        break;
      case "setListenerPort":
        $("awtrix-port-save").disabled = false;
        showMessage("awtrix-listener-message", payload.ok ? "Listener restarted" : payload.error, payload.ok ? "success" : "error");
        break;
    }
  });

  const PANEL_TEMPLATE = `
    <sdpi-item label="AWTRIX panel">
      <div id="awtrix-status" class="status unconfigured">
        <div><strong id="awtrix-status-text">…</strong><span id="awtrix-status-detail"></span></div>
      </div>
    </sdpi-item>
    <sdpi-item label="Host"><sdpi-textfield id="awtrix-host" placeholder="192.168.1.42 or awtrix.local"></sdpi-textfield></sdpi-item>
    <sdpi-item>
      <div class="buttons">
        <sdpi-button id="awtrix-test">Test</sdpi-button>
        <sdpi-button id="awtrix-save">Save</sdpi-button>
      </div>
    </sdpi-item>
    <div id="awtrix-message" class="message" hidden></div>
    <p class="hint">IP address or host name of the panel, without http://. "Test" calls /api/stats. The host is shared by all keys and dials.</p>`;

  const LISTENER_TEMPLATE = `
    <sdpi-item label="Claude listener">
      <div id="awtrix-listener-status" class="status stopped">
        <div><strong id="awtrix-listener-text">…</strong><span id="awtrix-listener-detail"></span></div>
      </div>
    </sdpi-item>
    <sdpi-item label="Port"><sdpi-textfield id="awtrix-port" placeholder="42931" pattern="[0-9]*"></sdpi-textfield></sdpi-item>
    <sdpi-item><sdpi-button id="awtrix-port-save">Save</sdpi-button></sdpi-item>
    <div id="awtrix-listener-message" class="message" hidden></div>
    <p class="hint">The Claude Code hook posts its state to http://127.0.0.1:&lt;port&gt;/ (see the README). Local connections only.</p>`;

  window.addEventListener("DOMContentLoaded", () => {
    $("awtrix-connection").innerHTML = PANEL_TEMPLATE;

    $("awtrix-host").addEventListener("input", () => (hostEdited = true));

    $("awtrix-test").addEventListener("click", () => {
      const host = ($("awtrix-host").value || "").trim();
      if (!host) {
        showMessage("awtrix-message", "Please enter the panel host", "error");
        return;
      }
      showMessage("awtrix-message", "Testing…", "");
      $("awtrix-test").disabled = true;
      send({ event: "testHost", host });
    });

    $("awtrix-save").addEventListener("click", () => {
      showMessage("awtrix-message", "Saving…", "");
      $("awtrix-save").disabled = true;
      send({ event: "setHost", host: ($("awtrix-host").value || "").trim() });
    });

    const listener = $("awtrix-listener");
    if (listener) {
      listener.innerHTML = LISTENER_TEMPLATE;
      $("awtrix-port").addEventListener("input", () => (portEdited = true));
      $("awtrix-port-save").addEventListener("click", () => {
        showMessage("awtrix-listener-message", "Saving…", "");
        $("awtrix-port-save").disabled = true;
        send({ event: "setListenerPort", listenerPort: ($("awtrix-port").value || "").trim() });
      });
    }

    send({ event: "getStatus" });
  });
})();
