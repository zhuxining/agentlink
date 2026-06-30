import { getDatabase } from "@/services/persistence";

export interface AcpSessionRecord {
  acpServerId: string;
  acpSessionId: string;
  agentId: string;
  threadId: string;
}

export class AcpSessionMapper {
  findByThreadId(threadId: string): AcpSessionRecord | null {
    const row = getDatabase()
      .prepare(
        "SELECT acp_server_id, acp_session_id, agent_id FROM conversations WHERE id = ? AND acp_session_id IS NOT NULL"
      )
      .get(threadId) as
      | { acp_server_id: string; acp_session_id: string; agent_id: string }
      | undefined;
    return row
      ? {
          threadId,
          acpServerId: row.acp_server_id,
          acpSessionId: row.acp_session_id,
          agentId: row.agent_id,
        }
      : null;
  }

  createMapping(p: {
    threadId: string;
    acpServerId: string;
    acpSessionId: string;
    agentId: string;
  }): AcpSessionRecord {
    getDatabase()
      .prepare(
        "UPDATE conversations SET acp_server_id=?, acp_session_id=?, agent_id=?, updated_at=? WHERE id=?"
      )
      .run(p.acpServerId, p.acpSessionId, p.agentId, Date.now(), p.threadId);
    return {
      threadId: p.threadId,
      acpServerId: p.acpServerId,
      acpSessionId: p.acpSessionId,
      agentId: p.agentId,
    };
  }

  closeSession(threadId: string): void {
    getDatabase()
      .prepare(
        "UPDATE conversations SET acp_session_id=NULL, updated_at=? WHERE id=?"
      )
      .run(Date.now(), threadId);
  }
}
