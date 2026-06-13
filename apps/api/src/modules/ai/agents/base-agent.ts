import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../../database/prisma.service';
import { CustomerMemoryService } from '../customer-memory.service';
import { AgentContext, AgentResponse, AgentSettings } from './types';

/**
 * Abstract base class for all specialized agents.
 * Implements the Strategy Pattern — each agent defines its own
 * prompt, tools, and tool execution logic.
 */
export abstract class BaseAgent {
  protected readonly logger: Logger;
  protected readonly openai: OpenAI;

  abstract readonly name: string;
  abstract readonly description: string;

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly config: ConfigService,
    protected readonly customerMemory: CustomerMemoryService,
  ) {
    this.logger = new Logger(this.constructor.name);
    this.openai = new OpenAI({
      apiKey: this.config.get('OPENAI_API_KEY'),
    });
  }

  /** Agent-specific system prompt */
  abstract getSystemPrompt(tenant: any, settings: AgentSettings): string;

  /** Agent-specific tool definitions */
  abstract getTools(): OpenAI.Chat.ChatCompletionTool[];

  /** Agent-specific tool execution */
  abstract executeTool(name: string, args: any, context: AgentContext): Promise<string>;

  /**
   * Process a message through this agent.
   * Shared logic: build messages → call OpenAI → handle tool calls → return.
   */
  async process(message: string, context: AgentContext, tenant: any): Promise<AgentResponse> {
    const settings = context.agentConfig.agents[this.name as keyof typeof context.agentConfig.agents];
    const model = settings?.model ?? 'gpt-4o';
    const temperature = settings?.temperature ?? 0.3;

    // Build system prompt with memory context
    const systemPrompt = this.getSystemPrompt(tenant, settings) + context.memoryContext;

    // Assemble messages
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...context.conversationHistory,
      { role: 'user', content: message },
    ];

    // Call OpenAI
    const tools = this.getTools();
    const response = await this.openai.chat.completions.create({
      model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
      temperature,
      max_tokens: 1000,
    });

    const choice = response.choices[0];
    const toolsExecuted: string[] = [];

    // Handle tool calls
    if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
      messages.push({ role: 'assistant', tool_calls: choice.message.tool_calls, content: null });

      for (const toolCall of choice.message.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        let result: string;
        try {
          result = await this.executeTool(toolCall.function.name, args, context);
          toolsExecuted.push(toolCall.function.name);
        } catch (err: any) {
          result = JSON.stringify({ error: err.message });
        }
        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: result });
      }

      // Second call with tool results
      const finalResponse = await this.openai.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: 800,
      });

      return {
        text: finalResponse.choices[0]?.message?.content ?? 'Procesé tu solicitud.',
        toolsExecuted,
      };
    }

    return {
      text: choice.message.content ?? 'Lo siento, no pude procesar tu mensaje.',
      toolsExecuted,
    };
  }
}
