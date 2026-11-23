import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectCommander } from 'nest-commander';
import { messages } from './messages.js';

/** Minimal shape of commander's program; commander is not a direct dependency. */
interface HelpTextTarget {
  addHelpText(position: 'after', text: string): unknown;
}

/** Appends the disclaimer and author credits to `drawnine --help`. */
@Injectable()
export class HelpFooter implements OnModuleInit {
  constructor(@InjectCommander() private readonly program: HelpTextTarget) {}

  onModuleInit(): void {
    this.program.addHelpText(
      'after',
      `\n${messages.disclaimer}\n${messages.credits}`,
    );
  }
}
