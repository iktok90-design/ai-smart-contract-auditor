# @version 0.2.15
# DEMO ONLY — DO NOT DEPLOY.
#
# Intentionally vulnerable Vyper contract used by Rugproof's `/demo vyper`.
# Showcases:
#   - Pinned to Vyper 0.2.15 — known-broken @nonreentrant decorator
#   - raw_call ignores return value
#   - send() with 2300 gas (broken for smart wallets / on some L2s)
#   - missing access control
#   - default mapping semantics misuse

balances: public(HashMap[address, uint256])
owner:    public(address)
paused:   public(bool)

@external
def __init__():
    self.owner = msg.sender


@external
@payable
def deposit():
    self.balances[msg.sender] += msg.value


@external
@nonreentrant("lock")     # VYPER-001 — broken in 0.2.15 (Curve/Vyper July 2023, ~$73M)
def withdraw():
    amt: uint256 = self.balances[msg.sender]
    assert amt > 0, "no balance"

    # VYPER-002 — send() forwards only 2300 gas; smart wallet recipients can't accept
    send(msg.sender, amt)

    self.balances[msg.sender] = 0


@external
def notify(target: address, data: Bytes[256]):
    # VYPER-003 — raw_call ignores return data; max_outsize=0 means no return inspection
    # Plus: no access control — anyone can use the contract as a relay.
    raw_call(target, data)


@external
def set_paused(p: bool):
    # VYPER-004 — missing access control; anyone can flip pause flag.
    self.paused = p


@external
def admin_drain():
    # VYPER-005 — owner sweep with no allowlist; can drain all user deposits.
    assert msg.sender == self.owner
    send(self.owner, self.balance)
