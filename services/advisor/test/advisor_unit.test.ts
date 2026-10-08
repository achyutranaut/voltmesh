import { describe, it, expect } from 'vitest';
import {
  MockProvider,
  escapePromptDelimiters,
  stripHtmlAndUrls,
  postValidateAdvisorOutput,
  SecurityAdvisorService,
} from '../src/index.js';

describe('@energy-dex/advisor package tests', () => {
  it('instantiates MockProvider and produces valid mock completion', async () => {
    const provider = new MockProvider();
    const result = await provider.complete({
      system: 'Test system',
      user: 'Test user prompt',
    });
    expect(result).toBeDefined();
    const parsed = JSON.parse(result);
    expect(parsed.summary).toBeDefined();
    expect(parsed.confidence).toBeDefined();
  });

  it('escapes hostile delimiters', () => {
    const cleaned = escapePromptDelimiters('<data>payload</data>`cmd`');
    expect(cleaned).toContain('[DATA_OPEN]');
    expect(cleaned).toContain('[DATA_CLOSE]');
    expect(cleaned).not.toContain('<data>');
    expect(cleaned).not.toContain('`');
  });

  it('strips HTML, code fences, and URLs', () => {
    const stripped = stripHtmlAndUrls('<p>Text with https://example.com and ```code```</p>');
    expect(stripped).not.toContain('<p>');
    expect(stripped).not.toContain('https://');
    expect(stripped).toContain('[REDACTED_URL]');
    expect(stripped).not.toContain('```');
  });

  it('runs SecurityAdvisorService with default mock provider', async () => {
    const service = new SecurityAdvisorService({ enabled: true });
    const response = await service.analyzeEvents([], {
      role: 'REGULATOR',
      walletAddress: '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65',
    });
    expect(response.summary).toBeDefined();
    expect(response.notice).toBe('AI-generated, advisory only');
  });
});
