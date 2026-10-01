export type NavigationTab = 
  | 'market' 
  | 'energy' 
  | 'oracle' 
  | 'settlement' 
  | 'certificates' 
  | 'operations';

export type PipelineStage =
  | 'METER'
  | 'ATTESTATION'
  | 'ORACLE'
  | 'EPOCH'
  | 'AUCTION'
  | 'DELIVERY'
  | 'SETTLEMENT'
  | 'CERTIFICATE';

export interface DetailDrawerData {
  title: string;
  subtitle?: string;
  category: string;
  statusBadge?: {
    label: string;
    variant: 'neutral' | 'success' | 'warning' | 'error' | 'info';
  };
  metrics?: { label: string; value: string; unit?: string }[];
  properties: { label: string; value: string | number; mono?: boolean }[];
  signature?: {
    publicKey: string;
    signatureHex: string;
    algorithm?: string;
    status: 'VALID' | 'INVALID' | 'UNVERIFIED';
  };
  merkleProof?: {
    root: string;
    leaf: string;
    siblings: string[];
    index: number;
    depth: number;
  };
  rawPayload?: any;
}
