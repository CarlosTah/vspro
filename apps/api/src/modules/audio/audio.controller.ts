import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AudioTranscriptionService } from './audio-transcription.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('audio')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('audio')
export class AudioController {
  constructor(private readonly audio: AudioTranscriptionService) {}

  /** Transcribe an audio URL to text */
  @Post('transcribe')
  @Roles('admin', 'manager', 'operator')
  transcribe(@Body() body: { audioUrl: string; accessToken?: string }) {
    return this.audio.transcribeFromUrl(body.audioUrl, body.accessToken);
  }

  /** Transcribe + interpret as business instruction */
  @Post('interpret')
  @Roles('admin', 'manager', 'operator')
  interpret(@Body() body: { audioUrl: string; accessToken?: string }) {
    return this.audio.transcribeAndInterpret(body.audioUrl, body.accessToken);
  }
}
