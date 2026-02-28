import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { ConstitutionalAIValidator } from '@/lib/validator';

// Request validation schema
const ValidateIntentSchema = z.object({
  intent: z.string().min(1).max(10000),
  policy_id: z.string().optional(),
  user_id: z.string().optional(),
  context: z.record(z.unknown()).optional(),
});

type ValidateIntentRequest = z.infer<typeof ValidateIntentSchema>;

// Response schema
const ValidateIntentResponseSchema = z.object({
  valid: z.boolean(),
  risk_score: z.number().min(0).max(1),
  reasoning: z.string(),
  blocked_rules: z.array(z.string()),
  requires_approval: z.boolean(),
});

/**
 * POST /api/validate-intent
 *
 * Validates user intent against Constitutional AI policies
 *
 * Request:
 * {
 *   "intent": "User's intended action as text",
 *   "policy_id": "optional policy to use",
 *   "user_id": "optional user context",
 *   "context": { optional context data }
 * }
 *
 * Response:
 * {
 *   "valid": boolean,
 *   "risk_score": 0.0-1.0,
 *   "reasoning": "explanation",
 *   "blocked_rules": ["rule names"],
 *   "requires_approval": boolean
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = ValidateIntentSchema.parse(body);

    logger.info('Intent validation request', {
      intent_length: validated.intent.length,
      user_id: validated.user_id,
    });

    // Initialize validator
    const validator = new ConstitutionalAIValidator();

    // Validate intent
    const result = await validator.validateIntent(
      validated.intent,
      validated.policy_id,
      validated.context
    );

    logger.info('Intent validation result', {
      valid: result.valid,
      risk_score: result.risk_score,
      blocked_rules: result.blocked_rules.length,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Validation schema error', { errors: error.errors });
      return NextResponse.json(
        { error: 'Invalid request schema' },
        { status: 400 }
      );
    }

    logger.error('Intent validation error', {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/validate-intent (health check)
 */
export async function GET() {
  return NextResponse.json({
    service: 'constitutional-ai',
    status: 'operational',
    version: '1.0.0',
  });
}
