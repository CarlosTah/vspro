import { Controller, Post, Body, Get, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: any) {
    // El tenantSlug viene del middleware (resuelto por subdominio o header)
    const tenantSlug = req.tenant?.slug ?? dto.tenantSlug;
    return this.authService.login(dto.email, dto.password, tenantSlug);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  me(@Req() req: any) {
    return req.user;
  }
}
