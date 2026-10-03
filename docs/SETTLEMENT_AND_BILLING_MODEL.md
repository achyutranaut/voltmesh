# VoltMesh — Settlement & Utility Billing Model

## 1. Foundational Separation: Market Settlement vs Utility Billing

In real-world P2P energy trading, confusion frequently arises regarding the term **"settlement"**. VoltMesh strictly differentiates two fundamentally distinct financial lifecycles:

1. **Market Payment Settlement ($T+1$ Daily Cycle):**
   - **Timing:** 24 hours post-delivery ($T+1$).
   - **Counterparties:** P2P Buyer $\longleftrightarrow$ P2P Seller, Platform Operator, and DISCOM (for wheeling fee collection).
   - **Rail:** On-chain non-custodial smart contract escrow (`Escrow.sol` / `BatchSettlement.sol`) or payment rails.
   - **Scope:** Settles the cleared contractual P2P energy payment, net of shortfall penalties, platform transaction fees, and wheeling charges.

2. **Utility Billing Adjustment (Monthly CIS Cycle):**
   - **Timing:** Standard utility monthly meter reading and billing cycle (e.g. 30-day bill).
   - **Counterparties:** Consumer/Prosumer $\longleftrightarrow$ Distribution Utility (DISCOM).
   - **Rail:** Utility enterprise billing engine (SAP IS-U / Oracle CC&B / BBPS).
   - **Scope:** Modifies the physical electricity bill:
     - **Prosumer Bill:** Net delivered P2P units are credited against grid import or carried forward as energy credits.
     - **Consumer Bill:** Net verified P2P units are deducted from the consumer's highest retail tariff slab, replacing utility energy charges with the lower P2P tariff.

---

## 2. Mathematical Models for Asymmetric Deviations

Let:
- $Q_{\text{contracted}}$ = Cleared bilateral energy obligation ($Wh$)
- $Q_{\text{seller}}$ = Actual smart-meter generation injected into the grid by seller ($Wh$)
- $Q_{\text{buyer}}$ = Actual smart-meter consumption drawn from the grid by buyer ($Wh$)
- $P_{\text{clearing}}$ = Uniform market clearing price (Paise per $kWh$)
- $P_{\text{ref}}$ = DISCOM standard retail reference tariff (Paise per $kWh$, default 700 Paise/kWh)
- $\rho_{\text{shortfall}}$ = Shortfall penalty rate in basis points (default 2000 bps = 20%)
- $\tau_{\text{wheeling}}$ = DISCOM network wheeling charge (default 35 Paise/kWh)
- $\tau_{\text{platform}}$ = Platform transaction fee (default 10 Paise/kWh)
- $\gamma_{\text{GST}}$ = Goods & Services Tax on services (default 1800 bps = 18%)

### 2.1 Actual Delivered P2P Energy
Physical P2P delivery is bounded by mutual intersection:
$$Q_{\text{delivered}} = \min(Q_{\text{contracted}}, Q_{\text{seller}}, Q_{\text{buyer}})$$

### 2.2 Seller Under-Injection (Shortfall)
When actual seller injection is less than contracted ($Q_{\text{seller}} < Q_{\text{contracted}}$):
$$\Delta Q_{\text{shortfall}} = Q_{\text{contracted}} - Q_{\text{seller}}$$

The seller failed to supply scheduled power to the grid. The missing energy was physically supplied by the DISCOM central grid. The seller incurs a replacement shortfall penalty:
$$\text{Penalty}_{\text{shortfall}} = \frac{\Delta Q_{\text{shortfall}} \times P_{\text{ref}} \times \rho_{\text{shortfall}}}{10^7} \quad (\text{in Paise})$$

- The buyer is refunded escrow collateral for unfulfilled units: $\frac{\Delta Q_{\text{shortfall}} \times P_{\text{clearing}}}{1000}$.
- On the monthly utility bill, DISCOM bills the buyer for $\Delta Q_{\text{shortfall}}$ at normal retail tariff rates.

### 2.3 Buyer Under-Draw (Take-or-Pay)
When actual buyer consumption is less than contracted ($Q_{\text{buyer}} < Q_{\text{contracted}}$), but the seller injected energy up to contracted ($Q_{\text{seller}} \ge Q_{\text{delivered}}$):
$$\Delta Q_{\text{underdraw}} = \min(Q_{\text{seller}}, Q_{\text{contracted}}) - Q_{\text{delivered}}$$

Under the standard DERC/UPERC 100% take-or-pay rule, because the seller committed solar capacity and physically exported green electrons to the distribution transformer for the buyer:
$$\text{Obligation}_{\text{underdraw}} = \frac{\Delta Q_{\text{underdraw}} \times P_{\text{clearing}}}{1000} \quad (\text{in Paise})$$

The unconsumed green energy absorbed by the grid is accounted for as a DISCOM grid credit ($\text{discomCreditWh} = \Delta Q_{\text{underdraw}}$) under utility net-metering/banking provisions.

---

## 3. Multi-Component Regulatory Fee Schedule

For every cleared trade, the settlement engine calculates the complete transaction breakdown:

$$\text{EnergyCost} = \frac{Q_{\text{delivered}} \times P_{\text{clearing}}}{1000}$$
$$\text{WheelingFee} = \frac{Q_{\text{delivered}} \times \tau_{\text{wheeling}}}{1000}$$
$$\text{PlatformFee} = \frac{Q_{\text{delivered}} \times \tau_{\text{platform}}}{1000}$$
$$\text{Tax}_{\text{GST}} = \frac{(\text{WheelingFee} + \text{PlatformFee}) \times \gamma_{\text{GST}}}{10000}$$

### Net Balances:
- **Net Seller Receivable:**
  $$\text{SellerPayout} = \text{EnergyCost} + \text{Obligation}_{\text{underdraw}} - \text{Penalty}_{\text{shortfall}}$$
- **Net Buyer Payable:**
  $$\text{BuyerDebit} = \text{EnergyCost} + \text{Obligation}_{\text{underdraw}} + \text{WheelingFee} + \text{PlatformFee} + \text{Tax}_{\text{GST}}$$

---

## 4. Billing Adjustment State Machine

Every P2P transaction produces a linked `BillingAdjustment` record tracked through an explicit state machine:

```
[ PENDING ]
     │
     ▼ (meter telemetry verified by MDMS)
[ VERIFIED ]
     │
     ▼ (submitted to DISCOM billing adapter)
[ SUBMITTED ]
     │
     ▼ (acknowledged by CIS batch import)
[ ACCEPTED ]
     │
     ▼ (monthly electricity bill generated and dispatched)
[ ADJUSTED ]
```

Failure / Exception paths:
- `REJECTED`: Discrepancy between consumer account and service point.
- `DISPUTED`: Consumer or prosumer raises formal metering grievance.
